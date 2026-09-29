'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { CellUpdateResult, CustomerColumnKey } from '@/lib/customer-query';
import {
  addCustomerComment,
  archiveCustomers,
  createCustomer,
  deleteCustomerComment,
  purgeCustomers,
  restoreCustomers,
  updateCustomer,
  updateCustomerField,
  type CustomerInput,
} from '@/lib/data/customers';

/**
 * Saves one inline cell edit.
 *
 * The table already sits inside the search GET form, so a form per cell would nest
 * forms — the cell calls this directly from a client transition instead. On success
 * `revalidatePath` ships a freshly rendered table (and customer page) back in the
 * same round trip; validation errors come back as a value so the cell can show them
 * in place.
 */
export async function updateCustomerCellAction(input: {
  customerId: string;
  column: CustomerColumnKey;
  value: string;
}): Promise<CellUpdateResult> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const customerId = typeof input?.customerId === 'string' ? input.customerId : '';
  const column = typeof input?.column === 'string' ? input.column : '';
  const value = typeof input?.value === 'string' ? input.value : '';

  if (!customerId) return { ok: false, error: 'Missing customer.' };

  const result = await updateCustomerField({ customerId, column, value });

  if (result.ok) {
    revalidatePath('/customers');
    revalidatePath(`/customers/${customerId}`);
  }

  return result;
}

/** Actions are reachable by direct POST, so coerce the argument shape first. */
function toIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string');
}

/** Everything that shows customers has to be refreshed after a bulk change. */
function revalidateCustomerViews(): void {
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  revalidatePath('/customers/archived');
}

/**
 * Soft delete — available to every signed-in user. The customers disappear from
 * every view but nothing is destroyed, and an administrator can restore them.
 */
export async function archiveCustomersAction(input: {
  ids: string[];
}): Promise<{ ok: true; archived: number } | { ok: false; error: string }> {
  const result = await archiveCustomers(toIdList(input?.ids));
  if (result.ok) revalidateCustomerViews();
  return result;
}

/** Administrators only: bring archived customers back into every view. */
export async function restoreCustomersAction(input: {
  ids: string[];
}): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  const result = await restoreCustomers(toIdList(input?.ids));
  if (result.ok) revalidateCustomerViews();
  return result;
}

/**
 * Administrators only, and irreversible: the customer and its contacts, addresses,
 * quotes, documents, communications and activity trail are removed for good.
 */
export async function purgeCustomersAction(input: {
  ids: string[];
}): Promise<{ ok: true; purged: number } | { ok: false; error: string }> {
  const result = await purgeCustomers(toIdList(input?.ids));
  if (result.ok) revalidateCustomerViews();
  return result;
}

/** Shape of the create/edit form's result, consumed by `useActionState`. */
export type CustomerFormState = {
  error?: string;
  /** Which field the error belongs to, so the form can highlight it. */
  field?: string;
  success?: string;
  /** Echoed back so a rejected submit never loses what was typed. */
  values?: Record<string, string>;
};

/** The form's field names, in the order the form renders them. */
const CUSTOMER_FORM_FIELDS = [
  'name',
  'email',
  'phone',
  'statusId',
  'industryId',
  'owner',
  'address',
  'address_line2',
  'town',
  'city',
  'county',
  'postcode',
  'country',
] as const;

function readCustomerForm(formData: FormData): { values: Record<string, string>; input: CustomerInput } {
  const values: Record<string, string> = {};
  for (const field of CUSTOMER_FORM_FIELDS) values[field] = String(formData.get(field) ?? '');

  return {
    values,
    input: {
      name: values.name,
      email: values.email,
      phone: values.phone,
      statusId: values.statusId,
      industryId: values.industryId,
      owner: values.owner,
      address: values.address,
      address_line2: values.address_line2,
      town: values.town,
      city: values.city,
      county: values.county,
      postcode: values.postcode,
      country: values.country,
    },
  };
}

/**
 * Creates a customer and lands on its page. The account number is generated in the
 * data layer — it is internal bookkeeping and is never asked for.
 */
export async function createCustomerAction(
  _previous: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const { values, input } = readCustomerForm(formData);
  const result = await createCustomer(input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidatePath('/customers');
  revalidatePath('/dashboard');

  // `redirect` throws a control-flow exception, so it stays outside any try/catch.
  redirect(`/customers/${result.id}`);
}

/** Saves the whole customer record (and its primary address) in one go. */
export async function updateCustomerAction(
  _previous: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const customerId = String(formData.get('customerId') ?? '');
  if (!customerId) return { error: 'Missing customer.' };

  const { values, input } = readCustomerForm(formData);
  const result = await updateCustomer(customerId, input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidatePath('/customers');
  revalidatePath('/dashboard');
  revalidatePath(`/customers/${customerId}`);

  return { values, success: 'Customer saved.' };
}

/** Shape of the comment composer's result, consumed by `useActionState`. */
export type CommentFormState = {
  error?: string;
  /** Which part of the composer the error belongs to (`content` or `mentions`). */
  field?: string;
  success?: string;
  /** Echoed back so a rejected comment never loses what was typed. */
  values?: { content?: string; mentions?: string[] };
};

/**
 * Adds one comment to a customer's timeline, with the contacts and colleagues it tags.
 *
 * Comment, tags and audit row land together in the data layer, so a half-saved comment
 * is impossible; the timeline, the table's communications count and the dashboard's
 * recent list are all refreshed afterwards.
 */
export async function addCommentAction(
  _previous: CommentFormState,
  formData: FormData
): Promise<CommentFormState> {
  // Server Actions are reachable by direct POST, so coerce the argument shape first.
  const customerId = String(formData.get('customerId') ?? '').trim();
  const content = String(formData.get('content') ?? '');
  const mentions = formData
    .getAll('mentions')
    .filter((value): value is string => typeof value === 'string')
    .filter((value) => value !== '');

  if (!customerId) return { error: 'Missing customer.' };

  const result = await addCustomerComment({ customerId, content, mentions });

  if (!result.ok) {
    return { error: result.error, field: result.field, values: { content, mentions } };
  }

  revalidatePath(`/customers/${customerId}`);
  revalidatePath('/customers');
  revalidatePath('/dashboard');

  return { success: 'Comment added.' };
}

/**
 * Deletes one of your own comments.
 *
 * Called straight from a client transition (no form), like the inline cell edits: the
 * timeline, the table's communications count and the dashboard are all refreshed by the
 * revalidation, and the ownership check lives in the data layer where it cannot be
 * bypassed by a hand-made request.
 */
export async function deleteCommentAction(
  input: { commentId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const commentId = typeof input?.commentId === 'string' ? input.commentId : '';
  if (!commentId) return { ok: false, error: 'Missing comment.' };

  const result = await deleteCustomerComment(commentId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/customers/${result.customerId}`);
  revalidatePath('/customers');
  revalidatePath('/dashboard');

  return { ok: true };
}
