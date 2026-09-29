import type { Metadata } from 'next';
import Link from 'next/link';

import { ArchivedCustomers } from '@/components/customer-table/archived-customers';
import { verifyAdminPage } from '@/lib/auth/dal';
import { listArchivedCustomers, listPurgedCustomers } from '@/lib/data/customers';
import { formatDateTime, formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Archived customers',
};

type SearchParams = { page?: string | string[] };

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstValue(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Administrator-only review of archived (soft deleted) customers.
 *
 * Archiving is reversible and available to everyone from the customers table; this
 * is where an administrator decides: restore the customer, or delete it for good —
 * which also removes its contacts, addresses, quotes, documents, communications and
 * activity trail. `verifyAdminPage()` 404s for everyone else.
 */
export default async function ArchivedCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await verifyAdminPage();

  const query = await searchParams;
  const [archived, purged] = await Promise.all([
    listArchivedCustomers({ page: pageNumber(query.page) }),
    listPurgedCustomers(10),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Back to customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Archived customers
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Archived customers are hidden from the table, the dashboard and the picklists. Restore them, or
          delete them permanently — which also removes their contacts, addresses, quotes, documents,
          communications and activity trail.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Waiting for review{' '}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              ({formatNumber(archived.total)})
            </span>
          </h2>
        </div>

        <ArchivedCustomers rows={archived.rows} />

        {archived.pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-sm dark:border-zinc-800">
            <Link
              href={`/customers/archived?page=${Math.max(1, archived.page - 1)}`}
              className={
                archived.page <= 1
                  ? 'pointer-events-none text-zinc-400 dark:text-zinc-600'
                  : 'text-zinc-700 underline dark:text-zinc-200'
              }
            >
              Newer
            </Link>
            <span className="text-zinc-600 dark:text-zinc-400">
              Page {archived.page} of {archived.pageCount}
            </span>
            <Link
              href={`/customers/archived?page=${Math.min(archived.pageCount, archived.page + 1)}`}
              className={
                archived.page >= archived.pageCount
                  ? 'pointer-events-none text-zinc-400 dark:text-zinc-600'
                  : 'text-zinc-700 underline dark:text-zinc-200'
              }
            >
              Older
            </Link>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recently deleted for good</h2>
        </div>

        {purged.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing has been deleted permanently yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {purged.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatNumber(entry.contacts)} contact(s), {formatNumber(entry.communications)} communication(s),{' '}
                  {formatNumber(entry.addresses)} address(es) removed · {formatDateTime(entry.created_at)}
                  {entry.actor_name ? ` · by ${entry.actor_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
