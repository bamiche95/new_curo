'use server';

import { revalidatePath } from 'next/cache';

import {
  createCustomerStatus,
  deleteCustomerStatus,
  setCustomerStatusActive,
  updateCustomerStatus,
  type CustomerStatusDeleteResult,
  type CustomerStatusInput,
} from '@/lib/data/statuses';

/** Shape of the create/edit form's result, consumed by `useActionState`. */
export type CustomerStatusFormState = {
  error?: string;
  /** Which field the error belongs to, so the form can highlight it. */
  field?: string;
  success?: string;
  /** Echoed back so a rejected submit never loses what was typed. */
  values?: Record<string, string>;
};

/** Announces a status was switched on or off. */
export type CustomerStatusToggleResult = { ok: true } | { ok: false; error: string };

const STATUS_FORM_FIELDS = ['code', 'name', 'colour', 'sortOrder'] as const;

/**
 * Reads the form. Every value is untrusted — Server Actions are reachable by
 * direct POST — so the data layer re-checks the shape, the permissions, the colour
 * and the uniqueness of the code.
 *
 * `isActive` is a checkbox, which submits nothing when it is cleared, so the
 * echo-back carries `'on'` / `''` and the form reads that instead of a boolean.
 */
function readStatusForm(formData: FormData): {
  values: Record<string, string>;
  input: CustomerStatusInput;
} {
  const values: Record<string, string> = {};
  for (const field of STATUS_FORM_FIELDS) values[field] = String(formData.get(field) ?? '');

  const isActive = formData.get('isActive') !== null;
  values.isActive = isActive ? 'on' : '';

  return {
    values,
    input: {
      code: values.code,
      name: values.name,
      colour: values.colour,
      sortOrder: values.sortOrder,
      isActive,
    },
  };
}

/**
 * Everything that shows a status has to be refreshed after a change: the list, the
 * settings hub's counters, the customers table (its Status picklist, its filter and
 * the badges on existing rows) and the dashboard's status breakdown.
 */
function revalidateStatusViews(): void {
  revalidatePath('/settings/customer-statuses');
  revalidatePath('/settings');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
}

/**
 * Adds a status and reports success as a value, so the modal can close itself.
 *
 * Open to every signed-in user — the data layer decides what a non-administrator
 * may set (an active entry, appended to the end of the list).
 */
export async function createStatusAction(
  _previous: CustomerStatusFormState,
  formData: FormData
): Promise<CustomerStatusFormState> {
  const { values, input } = readStatusForm(formData);
  const result = await createCustomerStatus(input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateStatusViews();

  return { success: `Added ${result.name}.` };
}

/** Saves a status. Administrators only, re-checked in the data layer. */
export async function updateStatusAction(
  _previous: CustomerStatusFormState,
  formData: FormData
): Promise<CustomerStatusFormState> {
  const statusId = String(formData.get('statusId') ?? '');
  if (!statusId) return { error: 'Missing status.' };

  const { values, input } = readStatusForm(formData);
  const result = await updateCustomerStatus(statusId, input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateStatusViews();

  return { values, success: 'Status saved.' };
}

/**
 * Switches one status on or off.
 *
 * Called straight from a client transition (no form), like the other row-level
 * actions; the administrator check lives in the data layer where a hand-made
 * request cannot bypass it, and errors come back as a value.
 */
export async function setStatusActiveAction(input: {
  id: string;
  isActive: boolean;
}): Promise<CustomerStatusToggleResult> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const id = typeof input?.id === 'string' ? input.id : '';
  if (!id) return { ok: false, error: 'Missing status.' };

  const result = await setCustomerStatusActive(id, input.isActive === true);
  if (!result.ok) return result;

  revalidateStatusViews();

  return { ok: true };
}

/**
 * Removes one status and reports how many customers were left without one.
 * Administrators only; the data layer re-checks the session before deleting.
 */
export async function deleteStatusAction(input: { id: string }): Promise<CustomerStatusDeleteResult> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const id = typeof input?.id === 'string' ? input.id : '';
  if (!id) return { ok: false, error: 'Missing status.' };

  const result = await deleteCustomerStatus(id);
  if (!result.ok) return result;

  revalidateStatusViews();

  return result;
}