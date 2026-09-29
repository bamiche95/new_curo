import type { Metadata } from 'next';
import Link from 'next/link';

import { IndustryCreateDialog } from '@/components/industry-create-dialog';
import { IndustryTable } from '@/components/industry-table';
import { verifySession } from '@/lib/auth/dal';
import { listIndustries } from '@/lib/data/industries';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Industries',
};

/**
 * The industry picklist.
 *
 * Read-only for everyone: any signed-in user may view the list and add an
 * industry (through the header's modal), while changing or removing one is
 * limited to administrators — the page tells the table and the dialog whether to
 * render those actions, and the data layer re-checks the session for anything
 * that arrives as a direct POST.
 */
export default async function IndustriesPage() {
  const user = await verifySession();
  const industries = await listIndustries();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            ← Settings
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Industries</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            These fill the Industry picklist on the customers table and the Top industries panel on the dashboard.
            Anyone can add one; only an administrator can change or remove one.
          </p>
        </div>

        <IndustryCreateDialog canManage={user.isAdmin} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            All industries{' '}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              ({formatNumber(industries.length)})
            </span>
          </h2>
        </div>

        <IndustryTable rows={industries} canManage={user.isAdmin} />
      </section>
    </div>
  );
}