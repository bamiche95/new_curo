import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '@/lib/auth/actions';
import { verifySession } from '@/lib/auth/dal';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/contacts', label: 'Contacts' },
  // The hub every reference-data page hangs off; the pages themselves decide what
  // a signed-in user may do (see app/(dashboard)/settings).
  { href: '/settings', label: 'Settings' },
  { href: '/account/password', label: 'Account' },
];

/**
 * Shell for every protected screen. `verifySession()` runs on each request, so
 * this layout (and everything nested inside it) is unreachable when signed out.
 *
 * The shell is exactly one viewport tall and never scrolls itself: the header is
 * pinned, and only the content area scrolls. Pages that need their own panes
 * (like the customer table with its views sidebar) fill the area and scroll
 * internally instead.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await verifySession();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex w-full flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Curo CRM
            </Link>
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  {link.label}
                </Link>
              ))}
              {user.isAdmin ? (
                <Link
                  href="/customers/archived"
                  className="rounded-md px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  Archived
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{user.name}</p>
              <p className="text-zinc-500 dark:text-zinc-400">{user.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {user.mustChangePassword ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Your password was set by an administrator.{' '}
          <Link href="/account/password" className="font-medium underline">
            Choose your own password
          </Link>
          .
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6">{children}</main>
    </div>
  );
}
