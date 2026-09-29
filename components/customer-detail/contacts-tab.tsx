import Link from 'next/link';

import { EmptyRow, SectionCard } from '@/components/customer-detail/section';
import type { ContactRow } from '@/lib/data/types';
import { contactName } from '@/lib/mentions';

/**
 * Contacts belonging to the customer.
 *
 * Each row links to the contact's own record (`/contacts/[id]`) and the card carries
 * the add button, which pre-attaches the customer, so contacts can be managed from the
 * account as well as from the contacts table.
 */
export function ContactsTab({ customerId, contacts }: { customerId: string; contacts: ContactRow[] }) {
  return (
    <SectionCard title="Contacts" count={contacts.length}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Contacts belong to this customer and are edited on their own page.
        </p>
        <Link
          href={`/contacts/new?customer=${customerId}`}
          className="shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add contact
        </Link>
      </div>

      {contacts.length === 0 ? (
        <EmptyRow>No contacts recorded.</EmptyRow>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {contacts.map((contact) => (
            <li key={contact.id} className="px-5 py-4 text-sm">
              <Link
                href={`/contacts/${contact.id}`}
                className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
              >
                {contactName(contact)}
              </Link>
              <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500 dark:text-zinc-400">
                {contact.email ? <span>{contact.email}</span> : null}
                {contact.phone ? <span>{contact.phone}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

