import type { Metadata } from 'next';

import { ContactsTable } from '@/components/contact-table/contacts-table';
import { parseContactQuery, type RawParams } from '@/lib/contact-query';
import { listContacts } from '@/lib/data/contacts';

export const metadata: Metadata = {
  title: 'Contacts',
};

/**
 * The contacts table.
 *
 * A contact always belongs to a customer, so every row shows the account it is
 * attached to and links through to it. The table drives its filtering, sorting,
 * paging and column selection from the URL, exactly like `/customers`.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = (await searchParams) as RawParams;
  const state = parseContactQuery(params);
  const result = await listContacts(state);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Contacts</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every contact, with the customer it is attached to. Filter on any column, sort a header, and choose the
          columns you want.
        </p>
      </div>

      <ContactsTable
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        state={state}
      />
    </div>
  );
}
