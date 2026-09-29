import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { IndustryBadge, StatusBadge } from '@/components/badges';
import { CommentsTab } from '@/components/customer-detail/comments-tab';
import { ContactsTab } from '@/components/customer-detail/contacts-tab';
import { DetailsTab } from '@/components/customer-detail/details-tab';
import { DocumentsTab } from '@/components/customer-detail/documents-tab';
import { QuotesTab } from '@/components/customer-detail/quotes-tab';
import { EmptyRow, SectionCard } from '@/components/customer-detail/section';
import { CustomerTabs, tabKey } from '@/components/customer-detail/tabs';
import { UpdatesTab } from '@/components/customer-detail/updates-tab';
import { verifySession } from '@/lib/auth/dal';
import {
  getCustomer,
  getCustomerActivity,
  getCustomerAddresses,
  getCustomerCommunications,
  getCustomerContacts,
  getCustomerDocuments,
  getCustomerQuotes,
  getCustomerTabCounts,
  getLookupOptions,
  getMentionablePeople,
} from '@/lib/data/customers';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Customer',
};

type SearchParams = {
  tab?: string | string[];
  page?: string | string[];
  activityPage?: string | string[];
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstValue(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * A customer record, split into tabs (Details · Contacts · Quotes · Jobs · Updates ·
 * Comments · Documents).
 *
 * The tab lives in the URL (`?tab=…`), so every tab is a shareable deep link and the
 * back button works; only the active tab's data is fetched. Details edits every field
 * in place with the same pencil, Server Action and audit trail as the customers table.
 */
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  // An archived customer is only visible to an administrator — they are the ones
  // who decide whether to restore it or delete it for good.
  const user = await verifySession();
  if (customer.deleted_at && !user.isAdmin) notFound();

  const query = await searchParams;
  const tab = tabKey(query.tab);

  const counts = await getCustomerTabCounts(id);

  let content: ReactNode = null;

  if (tab === 'details') {
    const [addresses, lookups] = await Promise.all([getCustomerAddresses(id), getLookupOptions()]);
    content = (
      <DetailsTab
        customer={customer}
        addresses={addresses}
        statuses={lookups.statuses}
        industries={lookups.industries}
        owners={lookups.owners}
      />
    );
  } else if (tab === 'contacts') {
    content = <ContactsTab customerId={id} contacts={await getCustomerContacts(id)} />;
  } else if (tab === 'quotes') {
    content = <QuotesTab quotes={await getCustomerQuotes(id)} />;
  } else if (tab === 'jobs') {
    content = (
      <SectionCard title="Jobs">
        <EmptyRow>Jobs are not implemented yet — this tab is reserved for them.</EmptyRow>
      </SectionCard>
    );
  } else if (tab === 'updates') {
    content = (
      <UpdatesTab
        customerId={id}
        activity={await getCustomerActivity(id, { page: pageNumber(query.activityPage) })}
      />
    );
  } else if (tab === 'comments') {
    const timelinePage = pageNumber(query.page);
    const [communications, contacts, people] = await Promise.all([
      getCustomerCommunications(id, { page: timelinePage }),
      getCustomerContacts(id),
      getMentionablePeople(),
    ]);
    content = (
      <CommentsTab
        customerId={id}
        communications={communications}
        contacts={contacts}
        people={people}
        page={timelinePage}
        viewerId={user.id}
      />
    );
  } else {
    content = <DocumentsTab documents={await getCustomerDocuments(id)} />;
  }

  return (
    <div className="space-y-6">
      {customer.deleted_at ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong className="font-medium">Archived.</strong> This customer is hidden from the customers table,
          the dashboard and the picklists while it waits for a decision.{' '}
          <Link href="/customers/archived" className="font-medium underline">
            Review archived customers
          </Link>
          .
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div>
            <Link href="/customers" className="text-sm text-zinc-600 underline dark:text-zinc-400">
              ← Back to customers
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {customer.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge name={customer.status_name} colour={customer.status_colour} />
              <IndustryBadge name={customer.industry_name} />
              {customer.assigned_to_name ?? customer.assigned_group_name ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="font-medium">
                    {customer.assigned_to_name ?? customer.assigned_group_name}
                  </span>
                  {customer.assigned_to_name ? null : (
                    <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      group
                    </span>
                  )}
                </span>
              ) : null}
              {customer.vtiger_account_id ? (
                <span className="text-xs text-zinc-400 dark:text-zinc-600">
                  Vtiger #{customer.vtiger_account_id}
                </span>
              ) : null}
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{customer.email ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Phone</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{customer.phone ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Communications</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{formatNumber(counts.comments)}</dd>
              </div>
            </dl>
          </div>

          <Link
            href={`/customers/${customer.id}/edit`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Edit customer
          </Link>
        </div>

        <div className="mt-4">
          <CustomerTabs customerId={customer.id} active={tab} counts={counts} />
        </div>
      </div>

      {content}
    </div>
  );
}
