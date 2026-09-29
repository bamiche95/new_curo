'use client';

import { useState, useTransition } from 'react';

import { Pill } from '@/components/badges';
import { CustomerStatusDeleteDialog } from '@/components/customer-status-delete-dialog';
import { CustomerStatusEditDialog } from '@/components/customer-status-edit-dialog';
import type { CustomerStatusRow } from '@/lib/data/types';
import { formatDate, formatNumber } from '@/lib/format';
import { setStatusActiveAction } from '@/lib/status-actions';

const buttonClasses =
  'rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';
const dangerClasses =
  'rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950';
const cellClasses = 'px-4 py-3 text-zinc-600 dark:text-zinc-400';
const headClasses = 'px-4 py-2 font-medium';
const headRightClasses = 'px-4 py-2 text-right font-medium';

type Notice = { tone: 'info' | 'error'; text: string };

/**
 * The customer status picklist.
 *
 * Every signed-in user may add a status; `canManage` (the admin flag) decides
 * whether the change and remove controls are rendered at all. Those actions
 * re-check `isAdmin` in the data layer too, so hiding them is convenience, never
 * security. Editing and deleting each open a dialog — the delete one confirming
 * first, with the number of customers that would lose their status — while
 * switching a status on or off is the one action that needs neither.
 */
export function CustomerStatusTable({
  rows,
  canManage,
}: {
  rows: CustomerStatusRow[];
  canManage: boolean;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** The row whose Edit dialog is open, or null. */
  const [editing, setEditing] = useState<CustomerStatusRow | null>(null);
  /** The row whose Delete confirmation is open, or null. */
  const [deleting, setDeleting] = useState<CustomerStatusRow | null>(null);

  /** Switching a status on or off is the one action needing no confirmation. */
  const toggle = (row: CustomerStatusRow) => {
    setNotice(null);
    setBusyId(row.id);

    startTransition(async () => {
      const result = await setStatusActiveAction({ id: row.id, isActive: row.is_active !== 1 });

      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error });
      } else {
        setNotice({
          tone: 'info',
          text: `${row.name} is now ${row.is_active === 1 ? 'inactive' : 'active'}.`,
        });
      }

      setBusyId(null);
    });
  };

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No statuses yet. Add the first one with the{' '}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">New status</span> button above.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {canManage
            ? 'Administrators can reorder, recolour, switch off and remove statuses.'
            : 'You can add statuses; only an administrator can change or remove them.'}
        </span>
      </div>

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={
            notice.tone === 'error'
              ? 'px-4 text-xs text-red-600 dark:text-red-400'
              : 'px-4 text-xs text-green-700 dark:text-green-400'
          }
        >
          {notice.text}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th scope="col" className={headClasses}>
                Code
              </th>
              <th scope="col" className={headClasses}>
                Name
              </th>
              <th scope="col" className={headClasses}>
                Colour
              </th>
              <th scope="col" className={headClasses}>
                Sort order
              </th>
              <th scope="col" className={headClasses}>
                Status
              </th>
              <th scope="col" className={headRightClasses}>
                Customers
              </th>
              <th scope="col" className={headClasses}>
                Added
              </th>
              {canManage ? (
                <th scope="col" className={headClasses}>
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr key={row.id} className="align-middle">
                <td className={`${cellClasses} font-mono text-xs`}>{row.code}</td>
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{row.name}</td>
                <td className={cellClasses}>
                  {row.colour ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: row.colour }}
                      />
                      <span className="font-mono text-xs">{row.colour}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400 dark:text-zinc-600">Default grey</span>
                  )}
                </td>
                <td className={cellClasses}>{formatNumber(row.sort_order)}</td>
                <td className={cellClasses}>
                  {row.is_active === 1 ? <Pill tone="positive">Active</Pill> : <Pill tone="warning">Inactive</Pill>}
                </td>
                <td className={`${cellClasses} text-right`}>{formatNumber(row.customer_count)}</td>
                <td className={cellClasses}>{formatDate(row.created_at)}</td>
                {canManage ? (
                  <td className={cellClasses}>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={buttonClasses} onClick={() => setEditing(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={buttonClasses}
                        disabled={pending && busyId === row.id}
                        onClick={() => toggle(row)}
                      >
                        {row.is_active === 1 ? 'Switch off' : 'Switch on'}
                      </button>
                      <button type="button" className={dangerClasses} onClick={() => setDeleting(row)}>
                        Delete
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? <CustomerStatusEditDialog status={editing} onClose={() => setEditing(null)} /> : null}

      {deleting ? (
        <CustomerStatusDeleteDialog
          status={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(text) => setNotice({ tone: 'info', text })}
        />
      ) : null}
    </div>
  );
}