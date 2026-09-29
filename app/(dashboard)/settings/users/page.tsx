import type { Metadata } from 'next';
import Link from 'next/link';

import { UserCreateDialog } from '@/components/user-create-dialog';
import { UserTable } from '@/components/user-table';
import { verifyAdminPage } from '@/lib/auth/dal';
import { listUsers } from '@/lib/data/users';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Users',
};

/**
 * The user list — administrators only.
 *
 * `verifyAdminPage()` 404s for everyone else, so the screen is invisible rather
 * than a dead end, and every write re-checks `isAdmin` in `lib/data/users.ts`,
 * because a 404 cannot stop a direct POST.
 */
export default async function UsersPage() {
  const actor = await verifyAdminPage();
  const users = await listUsers();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            ← Settings
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Users</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Everyone who can sign in. A password set here is temporary — the account is asked to choose its own at the
            next sign-in, and setting one signs it out everywhere.
          </p>
        </div>

        <UserCreateDialog />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            All users{' '}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">({formatNumber(users.length)})</span>
          </h2>
        </div>

        <UserTable rows={users} currentUserId={actor.id} />
      </section>
    </div>
  );
}