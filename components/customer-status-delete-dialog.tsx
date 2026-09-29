'use client';

import { useState, useTransition } from 'react';

import { Dialog } from '@/components/dialog';
import type { CustomerStatusRow } from '@/lib/data/types';
import { formatNumber } from '@/lib/format';
import { deleteStatusAction } from '@/lib/status-actions';

const cancelClasses =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900';
const dangerClasses =
  'rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950';

/**
 * The confirmation for removing a status, as a modal rather than a
 * `window.confirm` — so the warning about the customers that will be left without
 * one is laid out properly, and the outcome is reported back to the list.
 *
 * `customers.customer_id_status_id` is `ON DELETE SET NULL`, so only the lookup row
 * is destroyed; the count says how many customers lose their status. Cancel comes
 * first in the DOM, so it is the button `showModal()` focuses.
 */
export function CustomerStatusDeleteDialog({
  status,
  onClose,
  onDeleted,
}: {
  status: CustomerStatusRow;
  onClose: () => void;
  /** Called with a one-line summary once the row is gone. */
  onDeleted?: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(null);

    startTransition(async () => {
      const result = await deleteStatusAction({ id: status.id });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onDeleted?.(
        result.unlinked > 0
          ? `Deleted ${result.name}. ${formatNumber(result.unlinked)} customer${
              result.unlinked === 1 ? '' : 's'
            } now have no status.`
          : `Deleted ${result.name}.`
      );
      onClose();
    });
  };

  return (
    <Dialog title={`Delete ${status.name}?`} description="This cannot be undone." onClose={onClose}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {status.customer_count > 0
          ? `${formatNumber(status.customer_count)} customer${
              status.customer_count === 1 ? '' : 's'
            } currently hold this status. They keep their details and simply lose the status — no customer is deleted.`
          : 'No customer holds this status.'}
      </p>

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
          {pending ? 'Deleting…' : 'Delete status'}
        </button>
      </div>
    </Dialog>
  );
}