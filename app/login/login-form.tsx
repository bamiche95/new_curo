'use client';

import { useActionState } from 'react';

import { loginAction, type LoginState } from '@/lib/auth/actions';

const initialState: LoginState = {};

const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const labelClasses = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300';

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={nextPath} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className={labelClasses} htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          defaultValue={state.email ?? ''}
          placeholder="you@example.com"
          className={inputClasses}
        />
      </div>

      <div>
        <label className={labelClasses} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClasses}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
        Forgotten your password? Ask an administrator to reset it for you.
      </p>
    </form>
  );
}
