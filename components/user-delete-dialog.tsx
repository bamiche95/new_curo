'use client';

import { useState, useTransition } from 'react';

import { Dialog } from '@/components/dialog';
import type { UserRow } from '@/lib/data/types';
import { formatNumber } from '@/lib/format';
import { deleteUserAction } from '@/lib/user-actions';

const cancelClasses =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900';
const dangerClasses =
  'rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950';

/**
 * The confirmation for removing an account, as a modal rather than a
 * `window.confirm` — so the consequences can be listed properly.
 *
 * The list is built from the counts the row already carries (the same foreign keys
 * the delete triggers — see `deleteUser`): cascading children are destroyed and
 * `customers.assigned_to` is nulled, so no customer is ever deleted. Cancel comes
 * first in the DOM, so it is the button `showModal()` focuses.
 */
export function UserDeleteDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: UserRow;
  onClose: () => void;
  /** Called with a one-line summary once the account is gone. */
  onDeleted?: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const plural = (count: number, noun: string) => `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`;

  const impacts = [
    user.customers_owned > 0
      ? `${plural(user.customers_owned, 'customer')} they own become unassigned (the customers themselves are kept)`
      : null,
    user.saved_views > 0 ? `${plural(user.saved_views, 'saved view')} are removed` : null,
    user.comment_tags > 0 ? `${plural(user.comment_tags, 'comment tag')} they were mentioned in are removed` : null,
    user.group_memberships > 0 ? `${plural(user.group_memberships, 'group membership')} are removed` : null,
  ].filter((line): line is string => line !== null);

  const remove = () => {
    setError(null);

    startTransition(async () => {
      const result = await deleteUserAction({ id: user.id });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onDeleted?.(`Deleted ${result.name}.`);
      onClose();
    });
  };

  return (
    <Dialog title={`Delete ${user.name}?`} description="This cannot be undone." onClose={onClose}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        The account and any session it has are removed, and it can no longer sign in.
      </p>

      {impacts.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {impacts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Nothing else depends on this account.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} disabled={pending} className={cancelClasses}>
          Cancel
        </button>
        <button type="button" onClick={remove} disabled={pending} className={dangerClasses}>
          {pending ? 'Deleting…' : 'Delete user'}
        </button>
      </div>
    </Dialog>
  );
}