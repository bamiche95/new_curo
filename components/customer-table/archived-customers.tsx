'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { purgeCustomersAction, restoreCustomersAction } from '@/lib/customer-actions';
import type { ArchivedCustomerRow } from '@/lib/data/types';
import { formatDateTime, formatNumber } from '@/lib/format';

const buttonClasses =
  'rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';
const dangerClasses =
  'rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950';
const cellClasses = 'px-4 py-3 text-zinc-600 dark:text-zinc-400';
const headClasses = 'px-4 py-2 font-medium';
const headRightClasses = 'px-4 py-2 text-right font-medium';

type Selection = Record<string, boolean>;

/** Stable empty value, so "nothing is selected" never creates a new object. */
const NO_SELECTION: Selection = {};

/**
 * The administrator review screen for soft-deleted customers.
 *
 * Restoring puts a customer back into every view. Deleting permanently is the
 * irreversible step and takes the contacts, addresses, quotes, documents,
 * communications and activity trail with it (all ON DELETE CASCADE) — the counts in
 * this table are exactly what that delete would destroy.
 */
export function ArchivedCustomers({ rows }: { rows: ArchivedCustomerRow[] }) {
  const [archiveError, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * The selection is stored with a signature of the list it was made on, so after an
   * action (the list re-renders) nothing stays selected but ids that are still listed.
   */
  const signature = rows.map((row) => row.id).join(',');
  const [selection, setSelection] = useState<{ signature: string; ids: Selection }>({
    signature: '',
    ids: NO_SELECTION,
  });
  const selected = selection.signature === signature ? selection.ids : NO_SELECTION;
  const selectedIds = rows.filter((row) => selected[row.id]).map((row) => row.id);

  const run = (ids: string[], action: 'restore' | 'purge') => {
    if (ids.length === 0) return;

    if (action === 'purge') {
      const count = ids.length;
      const confirmed = window.confirm(
        `Permanently delete ${count} customer${count === 1 ? '' : 's'}?\n\n` +
          'This removes the customer, its contacts, addresses, quotes, documents and communications, ' +
          'and its activity trail. It cannot be undone.'
      );
      if (!confirmed) return;
    }

    setError(null);
    startTransition(async () => {
      const result =
        action === 'restore' ? await restoreCustomersAction({ ids }) : await purgeCustomersAction({ ids });
      if (!result.ok) setError(result.error);
    });
  };

  const toggle = (id: string, next: boolean) =>
    setSelection((current) => ({
      signature,
      ids: { ...(current.signature === signature ? current.ids : NO_SELECTION), [id]: next },
    }));

  const row = (entry: ArchivedCustomerRow) => (
    <tr key={entry.id} className="align-middle">
      <td className={cellClasses}>
        <input
          type="checkbox"
          aria-label={`Select ${entry.name}`}
          checked={Boolean(selected[entry.id])}
          disabled={pending}
          onChange={(event) => toggle(entry.id, event.target.checked)}
          className="h-4 w-4 cursor-pointer"
        />
      </td>
      <td className={cellClasses}>
        <Link
          href={`/customers/${entry.id}`}
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
        >
          {entry.name}
        </Link>
      </td>
      <td className={cellClasses}>
        {formatDateTime(entry.deleted_at)}
        {entry.deleted_by_name ? (
          <span className="block text-xs text-zinc-400 dark:text-zinc-500">by {entry.deleted_by_name}</span>
        ) : null}
      </td>
      <td className={`${cellClasses} text-right`}>{formatNumber(entry.contacts)}</td>
      <td className={`${cellClasses} text-right`}>{formatNumber(entry.communications)}</td>
      <td className={`${cellClasses} text-right`}>{formatNumber(entry.addresses)}</td>
      <td className={`${cellClasses} text-right`}>{formatNumber(entry.quotes)}</td>
      <td className={`${cellClasses} text-right`}>{formatNumber(entry.documents)}</td>
      <td className={cellClasses}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClasses} disabled={pending} onClick={() => run([entry.id], 'restore')}>
            Restore
          </button>
          <button type="button" className={dangerClasses} disabled={pending} onClick={() => run([entry.id], 'purge')}>
            Delete permanently
          </button>
        </div>
      </td>
    </tr>
  );

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Nothing is archived. Customers archived on the{' '}
        <Link href="/customers" className="underline">
          customers table
        </Link>{' '}
        show up here for review.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {selectedIds.length === 0 ? 'Select customers to act on' : `${selectedIds.length} selected`}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClasses}
            disabled={selectedIds.length === 0 || pending}
            onClick={() => run(selectedIds, 'restore')}
          >
            Restore
          </button>
          <button
            type="button"
            className={dangerClasses}
            disabled={selectedIds.length === 0 || pending}
            onClick={() => run(selectedIds, 'purge')}
          >
            {pending ? 'Working…' : 'Delete permanently'}
          </button>
        </div>
      </div>

      {archiveError ? (
        <p role="alert" className="px-4 text-xs text-red-600 dark:text-red-400">
          {archiveError}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th scope="col" className="w-10 px-4 py-2" />
              <th scope="col" className={headClasses}>Account</th>
              <th scope="col" className={headClasses}>Archived</th>
              <th scope="col" className={headRightClasses}>Contacts</th>
              <th scope="col" className={headRightClasses}>Comms</th>
              <th scope="col" className={headRightClasses}>Addresses</th>
              <th scope="col" className={headRightClasses}>Quotes</th>
              <th scope="col" className={headRightClasses}>Docs</th>
              <th scope="col" className={headClasses}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">{rows.map(row)}</tbody>
        </table>
      </div>
    </div>
  );
}
