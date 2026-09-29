'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createContact,
  deleteContact,
  deleteContacts,
  searchCustomers,
  updateContact,
  type ContactInput,
} from '@/lib/data/contacts';
import type { ContactOption } from '@/lib/data/types';

/** Shape of the create/edit form's result, consumed by `useActionState`. */
export type ContactFormState = {
  error?: string;
  /** Which field the error belongs to, so the form can highlight it. */
  field?: string;
  success?: string;
  /** Echoed back so a rejected submit never loses what was typed. */
  values?: Record<string, string>;
};

/** The form's field names, in the order the form renders them. */
const CONTACT_FORM_FIELDS = ['customerId', 'firstName', 'lastName', 'email', 'phone'] as const;

function readContactForm(formData: FormData): { values: Record<string, string>; input: ContactInput } {
  const values: Record<string, string> = {};
  for (const field of CONTACT_FORM_FIELDS) values[field] = String(formData.get(field) ?? '');

  return {
    values,
    input: {
      customerId: values.customerId,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
    },
  };
}

/** Everything that shows a contact has to be refreshed after a change. */
function revalidateContactViews(contactId?: string, customerId?: string): void {
  revalidatePath('/contacts');
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  // Contact events are recorded on the customer's trail, and its Contacts tab shows
  // the count, so the owning customer's record is refreshed too.
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

/**
 * Creates a contact attached to a customer and lands on its page.
 *
 * The customer picker's value arrives as a plain `customerId` field; the data layer
 * re-checks that the customer exists and is not archived before anything is written.
 */
export async function createContactAction(
  _previous: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const { values, input } = readContactForm(formData);
  const result = await createContact(input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateContactViews(result.id, input.customerId);

  // `redirect` throws a control-flow exception, so it stays outside any try/catch.
  redirect(`/contacts/${result.id}`);
}

/** Saves the whole contact (and, when the picker changed, the customer it hangs off). */
export async function updateContactAction(
  _previous: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const contactId = String(formData.get('contactId') ?? '');
  if (!contactId) return { error: 'Missing contact.' };

  const { values, input } = readContactForm(formData);
  const result = await updateContact(contactId, input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateContactViews(contactId, input.customerId);

  return { values, success: 'Contact saved.' };
}

/**
 * Deletes a contact and reports the outcome.
 *
 * Called straight from a client transition (no form), like the comment delete: the
 * data layer records who removed it on the customer's trail inside the same
 * transaction as the delete, and the caller navigates back to the contacts table.
 * Errors come back as a value so the button can show them in place.
 */
export async function deleteContactAction(
  input: { contactId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const contactId = typeof input?.contactId === 'string' ? input.contactId : '';
  if (!contactId) return { ok: false, error: 'Missing contact.' };

  const result = await deleteContact(contactId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateContactViews(contactId, result.customerId);

  return { ok: true };
}


/**
 * Deletes the contacts selected in the table.
 *
 * Called from the table's own confirm-then-transition handler (no form), exactly like
 * the customers table's bulk archive. The argument is untrusted, so the data layer
 * re-checks its shape, its size and the session before anything is removed; the
 * revalidations refresh the table and every account the selection touched.
 */
export async function deleteContactsAction(
  input: { ids: string[] }
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  // Server Actions are reachable by direct POST, so coerce the argument shape first.
  const ids = Array.isArray(input?.ids)
    ? input.ids.filter((id): id is string => typeof id === 'string')
    : [];

  const result = await deleteContacts(ids);
  if (!result.ok) return result;

  revalidatePath('/contacts');
  // Each affected customer's Contacts count and Updates trail changed.
  for (const customerId of result.customerIds) revalidatePath(`/customers/${customerId}`);

  return { ok: true, deleted: result.deleted };
}

/**
 * Customers matching a typed term, for the attach picker.
 *
 * There are thousands of customers, so the combobox searches on demand instead of
 * shipping the whole list into the form. The session is re-verified in the data layer.
 */
export async function searchCustomersAction(term: string): Promise<ContactOption[]> {
  const value = typeof term === 'string' ? term : '';
  return searchCustomers(value);
}
