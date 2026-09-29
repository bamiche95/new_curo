import Link from 'next/link';

import { formatNumber } from '@/lib/format';

/** The seven tabs of a customer record, in display order. */
export const CUSTOMER_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'updates', label: 'Updates' },
  { key: 'comments', label: 'Comments' },
  { key: 'documents', label: 'Documents' },
] as const;

export type CustomerTabKey = (typeof CUSTOMER_TABS)[number]['key'];

/** Anything unrecognised falls back to the first tab. */
export function tabKey(value: string | string[] | undefined): CustomerTabKey {
  const requested = Array.isArray(value) ? value[0] : value;
  return (CUSTOMER_TABS.find((tab) => tab.key === requested)?.key ?? 'details') as CustomerTabKey;
}

/**
 * The horizontal tab strip. Tabs are links carrying `?tab=…`, so every tab is
 * shareable and the browser's back button works; the URL stays the single source of
 * truth, just like the customers table.
 */
export function CustomerTabs({
  customerId,
  active,
  counts,
}: {
  customerId: string;
  active: CustomerTabKey;
  counts: Partial<Record<CustomerTabKey, number>>;
}) {
  return (
    <nav
      aria-label="Customer sections"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 dark:border-zinc-800"
    >
      {CUSTOMER_TABS.map((tab) => {
        const isActive = tab.key === active;
        const count = counts[tab.key];

        return (
          <Link
            key={tab.key}
            href={`/customers/${customerId}?tab=${tab.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
              isActive
                ? 'border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-50'
                : 'border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-50'
            }`}
          >
            {tab.label}
            {count === undefined || count === 0 ? null : (
              <span className="ml-1.5 text-xs text-zinc-500 dark:text-zinc-400">{formatNumber(count)}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
