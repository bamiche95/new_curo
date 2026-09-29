'use server';

import { revalidatePath } from 'next/cache';

import {
  createIndustry,
  deleteIndustry,
  setIndustryActive,
  updateIndustry,
  type IndustryDeleteResult,
  type IndustryInput,
} from '@/lib/data/industries';

/** Shape of the create/edit form's result, consumed by `useActionState`. */
export type IndustryFormState = {
  error?: string;
  /** Which field the error belongs to, so the form can highlight it. */
  field?: string;
  success?: string;
  /** Echoed back so a rejected submit never loses what was typed. */
  values?: Record<string, string>;
};

/** Announces an industry was switched on or off. */
export type IndustryToggleResult = { ok: true } | { ok: false; error: string };

/**
 * Reads the form. Every value is untrusted — Server Actions are reachable by
 * direct POST — so the data layer re-checks the shape, the permissions and the
 * uniqueness of the code.
 *
 * `isActive` is a checkbox, which submits nothing when it is cleared, so the
 * echo-back carries `'on'` / `''` and the form reads that instead of a boolean.
 */
function readIndustryForm(formData: FormData): { values: Record<string, string>; input: IndustryInput } {
  const code = String(formData.get('code') ?? '');
  const name = String(formData.get('name') ?? '');
  const sortOrder = String(formData.get('sortOrder') ?? '');
  const isActive = formData.get('isActive') !== null;

  return {
    values: { code, name, sortOrder, isActive: isActive ? 'on' : '' },
    input: { code, name, sortOrder, isActive },
  };
}

/**
 * Everything that shows an industry has to be refreshed after a change: the list
 * itself, the customers table (its Industry picklist, its filter and the labels
 * on existing rows) and the dashboard's "Top industries" panel.
 */
function revalidateIndustryViews(): void {
  revalidatePath('/settings/industries');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
}

/**
 * Adds an industry.
 *
 * Open to every signed-in user — the data layer decides what a non-administrator
 * may set (an active entry, appended to the end of the list). Success comes back
 * as a value rather than a redirect, because the form lives in the list page's
 * modal and closes itself once it sees it; the revalidation ships the refreshed
 * list back in the same round trip.
 */
export async function createIndustryAction(
  _previous: IndustryFormState,
  formData: FormData
): Promise<IndustryFormState> {
  const { values, input } = readIndustryForm(formData);
  const result = await createIndustry(input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateIndustryViews();

  return { success: `Added ${result.name}.` };
}

/** Saves an industry. Administrators only, re-checked in the data layer. */
export async function updateIndustryAction(
  _previous: IndustryFormState,
  formData: FormData
): Promise<IndustryFormState> {
  const industryId = String(formData.get('industryId') ?? '');
  if (!industryId) return { error: 'Missing industry.' };

  const { values, input } = readIndustryForm(formData);
  const result = await updateIndustry(industryId, input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateIndustryViews();

  return { values, success: 'Industry saved.' };
}

/**
 * Switches one industry on or off.
 *
 * Called straight from a client transition (no form), like the other row-level
 * actions; the administrator check lives in the data layer where a hand-made
 * request cannot bypass it, and errors come back as a value.
 */
export async function setIndustryActiveAction(input: {
  id: string;
  isActive: boolean;
}): Promise<IndustryToggleResult> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const id = typeof input?.id === 'string' ? input.id : '';
  if (!id) return { ok: false, error: 'Missing industry.' };

  const result = await setIndustryActive(id, input.isActive === true);
  if (!result.ok) return result;

  revalidateIndustryViews();

  return { ok: true };
}

/**
 * Removes one industry and reports how many customers were left without one.
 * Administrators only; the data layer re-checks the session before deleting.
 */
export async function deleteIndustryAction(input: { id: string }): Promise<IndustryDeleteResult> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const id = typeof input?.id === 'string' ? input.id : '';
  if (!id) return { ok: false, error: 'Missing industry.' };

  const result = await deleteIndustry(id);
  if (!result.ok) return result;

  revalidateIndustryViews();

  return result;
}
