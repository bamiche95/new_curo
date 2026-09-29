import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/badges';
import {
  getDashboardStats,
  getRecentCommunications,
  getStatusBreakdown,
  getTopIndustries,
  getWatchlist,
} from '@/lib/data/dashboard';
import { formatDateTime, formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const [stats, statusBreakdown, industries, watchlist, communications] = await Promise.all([
    getDashboardStats(),
    getStatusBreakdown(),
    getTopIndustries(8),
    getWatchlist(),
    getRecentCommunications(10),
  ]);

  const cards = [
    { label: 'Customers', value: stats.customers, hint: 'Migrated accounts' },
    { label: 'Contacts', value: stats.contacts, hint: 'People on file' },
    { label: 'Communications', value: stats.communications, hint: 'Comments & mentions' },
    { label: 'Last 30 days', value: stats.recentCommunications, hint: 'New communications' },
  ];

  const customerTotal = Math.max(1, stats.customers);

  const watchlistItems = [
    { label: 'Documents expiring (30 days)', value: watchlist.documentsExpiringSoon, href: null },
    { label: 'Expired documents', value: watchlist.documentsExpired, href: null },
    { label: 'Open quotes', value: watchlist.openQuotes, href: null },
    { label: 'Customers with no status', value: watchlist.customersWithoutStatus, href: '/customers?status=none' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Customer activity migrated from Vtiger.</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatNumber(card.value)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{card.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Customers by status</h2>
            <Link href="/customers" className="text-xs text-zinc-600 underline dark:text-zinc-400">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {statusBreakdown.statuses.map((status) => (
              <li key={status.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <StatusBadge name={status.name} colour={status.colour} href={`/customers?status=${status.id}`} />
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatNumber(status.customer_count)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-1.5 rounded bg-zinc-400 dark:bg-zinc-600"
                    style={{ width: `${Math.round((status.customer_count / customerTotal) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
            {statusBreakdown.unassigned > 0 ? (
              <li className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <StatusBadge name={null} href="/customers?status=none" />
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatNumber(statusBreakdown.unassigned)}
                  </span>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Top industries</h2>
            <Link href="/customers" className="text-xs text-zinc-600 underline dark:text-zinc-400">
              Filter
            </Link>
          </div>
          {industries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">No industries assigned yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {industries.map((industry) => (
                <li key={industry.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <Link
                    href={`/customers?industry=${industry.id}`}
                    className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                  >
                    {industry.name}
                  </Link>
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatNumber(industry.customer_count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Compliance &amp; pipeline watchlist</h2>
        </div>
        <dl className="grid grid-cols-1 divide-y divide-zinc-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 dark:divide-zinc-800">
          {watchlistItems.map((item) => (
            <div key={item.label} className="px-5 py-4">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {item.href ? (
                  <Link href={item.href} className="underline-offset-2 hover:underline">
                    {formatNumber(item.value)}
                  </Link>
                ) : (
                  formatNumber(item.value)
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent communications</h2>
          <Link
            href="/customers"
            className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Browse customers
          </Link>
        </div>

        {communications.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-500 dark:text-zinc-400">No communications recorded yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {communications.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {item.communication_type}
                  </span>
                  <Link
                    href={`/customers/${item.customer_id}`}
                    className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                  >
                    {item.customer_name}
                  </Link>
                  <span>· {formatDateTime(item.created_at)}</span>
                  {item.author_name ? <span>· {item.author_name}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">{item.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
