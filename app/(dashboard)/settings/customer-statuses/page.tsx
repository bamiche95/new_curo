import type { Metadata } from 'next';
import Link from 'next/link';

import { CustomerStatusCreateDialog } from '@/components/customer-status-create-dialog';
import { CustomerStatusTable } from '@/components/customer-status-table';
import { verifySession } from '@/lib/auth/dal';
import { listCustomerStatuses } from '@/lib/data/statuses';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Customer statuses',
};

/**
 * The customer status picklist.
 *
 * Read-only for everyone: any signed-in user may view the list and add a status
 * (through the header's modal), while changing, switching off or removing one is
 * limited to administrators — the page tells the table and the dialog whether to
 * render those controls, and the data layer re-checks the session for anything that
 * arrives as a direct POST.
 */
export default async function CustomerStatusesPage() {
  const user = await verifySession();
  const statuses = await listCustomerStatuses();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            ← Settings
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Customer statuses
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            These fill the Status picklist on the customers table and the status breakdown on the dashboard. Anyone can
            add one, with the colour its badge shows; only an administrator can change or remove one.
          </p>
        </div>

        <CustomerStatusCreateDialog canManage={user.isAdmin} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            All statuses{' '}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">({formatNumber(statuses.length)})</span>
          </h2>
        </div>

        <CustomerStatusTable rows={statuses} canManage={user.isAdmin} />
      </section>
    </div>
  );
}