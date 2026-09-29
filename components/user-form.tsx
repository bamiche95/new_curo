'use client';

import { useActionState, useEffect } from 'react';

import { createUserAction, updateUserAction, type UserFormState } from '@/lib/user-actions';

const initialState: UserFormState = {};

const labelClasses = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300';
const hintClasses = 'mt-1 text-xs text-zinc-500 dark:text-zinc-400';
const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const errorInputClasses = 'border-red-400 dark:border-red-700';

const NAME_MAX_LENGTH = 255;
const EMAIL_MAX_LENGTH = 255;

/** The values the form starts from. The password field is never pre-filled. */
export type UserFormValues = {
  name: string;
  email: string;
  isAdmin: boolean;
};

function getValue(name: 'name' | 'email', values: UserFormValues, state: UserFormState): string {
  return state.values?.[name] ?? values[name] ?? '';
}

/**
 * Create/edit form for one account.
 *
 * One form serves both dialogs on the users screen, so the fields, the validation
 * feedback and the permission-dependent parts can never drift apart. The password
 * field always starts empty — and is never echoed back on a rejected submit — so
 * what an administrator types here stays a *temporary* password: the account is
 * flagged to choose its own at the next sign-in.
 */
export function UserForm({
  mode,
  userId,
  values,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  userId?: string;
  values: UserFormValues;
  /** Called once a save succeeded — the dialog closes itself with this. */
  onSuccess: () => void;
  /** The dialog's Cancel button. */
  onCancel: () => void;
}) {
  const formAction = mode === 'create' ? createUserAction : updateUserAction;
  const [state, action, pending] = useActionState<UserFormState, FormData>(formAction, initialState);

  // A cleared checkbox submits nothing at all, so the echo-back is 'on' or ''.
  const adminChecked = state.values ? state.values.isAdmin === 'on' : values.isAdmin;

  // A successful save is the dialog's cue to close; the list behind it has already
  // been refreshed by the action's revalidation.
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={action} className="space-y-6">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Account</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClasses} htmlFor="name">
              Name
              <span className="text-red-600 dark:text-red-400"> *</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={getValue('name', values, state)}
              maxLength={NAME_MAX_LENGTH}
              required
              aria-invalid={state.field === 'name' || undefined}
              className={`${inputClasses} ${state.field === 'name' ? errorInputClasses : ''}`}
            />
          </div>

          <div>
            <label className={labelClasses} htmlFor="email">
              Email
              <span className="text-red-600 dark:text-red-400"> *</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={getValue('email', values, state)}
              maxLength={EMAIL_MAX_LENGTH}
              required
              autoComplete="off"
              aria-invalid={state.field === 'email' || undefined}
              className={`${inputClasses} ${state.field === 'email' ? errorInputClasses : ''}`}
            />
            <p className={hintClasses}>This is the address they sign in with.</p>
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-start gap-2">
              <input
                id="isAdmin"
                name="isAdmin"
                type="checkbox"
                defaultChecked={adminChecked}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
              />
              <label className={labelClasses} htmlFor="isAdmin">
                Administrator
              </label>
            </div>
            <p className={`${hintClasses} ml-6`}>
              Administrators can restore or permanently delete customers, and manage the settings lists.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClasses} htmlFor="password">
              {mode === 'create' ? 'Temporary password' : 'New temporary password'}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={state.field === 'password' || undefined}
              className={`${inputClasses} ${state.field === 'password' ? errorInputClasses : ''}`}
            />
            <p className={hintClasses}>
              {mode === 'create'
                ? 'Optional. At least 8 characters with a letter and a number — they are asked to choose their own at the next sign-in.'
                : 'Leave blank to keep the current password. Setting one signs them out everywhere and forces a change at the next sign-in.'}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Add user' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Cancel
        </button>
      </div>
    </form>
  );
}