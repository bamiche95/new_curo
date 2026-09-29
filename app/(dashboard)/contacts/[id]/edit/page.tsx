import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContactDeleteButton } from '@/components/contact-detail/contact-delete-button';
import { ContactForm, type ContactFormValues } from '@/components/contact-form';
import { getContact, getCustomerOption } from '@/lib/data/contacts';
import { contactName } from '@/lib/mentions';

export const metadata: Metadata = {
  title: 'Edit contact',
};

/**
 * Edit screen: the same form as the create screen, pre-filled from the contact.
 *
 * The customer picker lets a contact be re-attached to a different account; the data
 * layer records a `CONTACT_MOVED` entry on both customers' trails when that happens.
 */
export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const contact = await getContact(id);
  if (!contact) notFound();

  const customer = await getCustomerOption(contact.customer_id);

  const values: ContactFormValues = {
    firstName: contact.first_name ?? '',
    lastName: contact.last_name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/contacts/${contact.id}`} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Back to {contactName(contact)}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit contact
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every change is recorded on {contact.customer_name}&apos;s Updates tab.
        </p>
      </div>

      <ContactForm mode="edit" contactId={contact.id} values={values} customer={customer} />

      <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Delete this contact</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The contact is removed for good — this cannot be undone. The customer and its other contacts are not
          affected.
        </p>
        <div className="mt-4">
          <ContactDeleteButton contactId={contact.id} name={contactName(contact)} />
        </div>
      </section>
    </div>
  );
}
