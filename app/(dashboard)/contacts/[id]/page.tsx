import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getContact } from '@/lib/data/contacts';
import { contactName } from '@/lib/mentions';

export const metadata: Metadata = {
  title: 'Contact',
};

/** One row of the read-only details list. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="w-28 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

/**
 * A contact record.
 *
 * It always shows the customer the contact is attached to, linking through to that
 * customer's page — a contact has no life of its own outside an account.
 */
export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/contacts" className="text-sm text-zinc-600 underline dark:text-zinc-400">
              ← Back to contacts
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {contactName(contact)}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {contact.email ?? 'No email'} · {contact.phone ?? 'No phone'}
            </p>
          </div>

          <Link
            href={`/contacts/${contact.id}/edit`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Edit contact
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Attached to</h2>
        <Link
          href={`/customers/${contact.customer_id}`}
          className="mt-2 inline-block text-base font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
        >
          {contact.customer_name}
        </Link>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Account #{contact.customer_account_no}</p>
        <Link
          href={`/customers/${contact.customer_id}?tab=contacts`}
          className="mt-3 inline-block text-xs text-zinc-600 underline dark:text-zinc-400"
        >
          See every contact at {contact.customer_name}
        </Link>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Contact details</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Field label="First name">{contact.first_name ?? '—'}</Field>
          <Field label="Last name">{contact.last_name}</Field>
          <Field label="Email">{contact.email ?? '—'}</Field>
          <Field label="Phone">{contact.phone ?? '—'}</Field>
          <Field label="Vtiger #">{contact.vtiger === null ? '—' : String(contact.vtiger)}</Field>
        </dl>
      </section>
    </div>
  );
}
