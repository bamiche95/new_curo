'use client';

import { useActionState } from 'react';

import { changePasswordAction, type ChangePasswordState } from '@/lib/auth/actions';

const initialState: ChangePasswordState = {};

const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const labelClasses = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300';

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    initialState
  );

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      ) : null}

      <div>
        <label className={labelClasses} htmlFor="currentPassword">
          Current password
        </label>
        <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className={inputClasses} />
      </div>

      <div>
        <label className={labelClasses} htmlFor="newPassword">
          New password
        </label>
        <input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" className={inputClasses} />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          At least 8 characters, including a letter and a number.
        </p>
      </div>

      <div>
        <label className={labelClasses} htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" className={inputClasses} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? 'Saving…' : 'Update password'}
      </button>
    </form>
  );
}
