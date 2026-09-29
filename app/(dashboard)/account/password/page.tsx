import type { Metadata } from 'next';

import { verifySession } from '@/lib/auth/dal';

import { ChangePasswordForm } from './password-form';

export const metadata: Metadata = {
  title: 'Account',
};

export default async function AccountPasswordPage() {
  const user = await verifySession();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Account security</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as {user.name} ({user.email})
        </p>
      </div>

      {user.mustChangePassword ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Your current password was set by an administrator. Please choose your own password below.
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Change password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
