import type { Metadata } from 'next';

import { CustomerTable } from '@/components/customer-table/customer-table';
import { ViewsSidebar } from '@/components/customer-table/views-sidebar';
import { parseCustomerQuery, isPristineQuery, viewToState, type RawParams } from '@/lib/customer-query';
import { getLookupOptions, listCustomers } from '@/lib/data/customers';
import { getDefaultView, listSavedViews } from '@/lib/data/saved-views';

export const metadata: Metadata = {
  title: 'Customers',
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = (await searchParams) as RawParams;

  let state = parseCustomerQuery(params);

  const views = await listSavedViews();

  // An explicitly selected view is expanded into concrete state; when the user
  // lands on /customers with no state of their own, their default view applies.
  const selected = state.viewId ? (views.find((view) => view.id === state.viewId) ?? null) : null;
  const applied = selected ?? (!selected && isPristineQuery(params) ? await getDefaultView() : null);

  if (applied) {
    state = viewToState(applied, state, params);
  }

  const [result, lookups] = await Promise.all([listCustomers(state), getLookupOptions()]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Customers</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Filter on any column, choose the columns you want, and save the result as your own view.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <ViewsSidebar key={`views-${state.viewId ?? 'custom'}`} views={views} state={state} />

        <div className="flex min-h-0 flex-1 flex-col">
          <CustomerTable
            rows={result.rows}
            total={result.total}
            page={result.page}
            pageCount={result.pageCount}
            state={state}
            statuses={lookups.statuses}
            industries={lookups.industries}
            owners={lookups.owners}
          />
        </div>
      </div>
    </div>
  );
}
