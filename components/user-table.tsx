'use client';

import { useState } from 'react';

import { Pill } from '@/components/badges';
import { UserDeleteDialog } from '@/components/user-delete-dialog';
import { UserEditDialog } from '@/components/user-edit-dialog';
import type { UserRow } from '@/lib/data/types';
import { formatDateTime } from '@/lib/format';

const buttonClasses =
  'rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';
const dangerClasses =
  'rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950';
const cellClasses = 'px-4 py-3 text-zinc-600 dark:text-zinc-400';
const headClasses = 'px-4 py-2 font-medium';

type Notice = { tone: 'info' | 'error'; text: string };

/** What the account's state pills say, in the order they are shown. */
function accountFlags(row: UserRow): { tone: 'neutral' | 'warning' | 'danger'; label: string }[] {
  const flags: { tone: 'neutral' | 'warning' | 'danger'; label: string }[] = [];
  if (row.is_locked === 1) flags.push({ tone: 'danger', label: 'Locked out' });
  if (row.has_password === 0) flags.push({ tone: 'warning', label: 'No password' });
  if (row.must_change_password === 1) flags.push({ tone: 'neutral', label: 'Must change password' });
  return flags;
}

/**
 * The user list.
 *
 * Administrator-only end to end, so the table itself decides nothing about
 * permission: the page is gated by `verifyAdminPage()` and every write re-checks
 * `isAdmin` in the data layer. Editing and deleting each open a dialog; an
 * administrator's own row is marked and its Delete button is disabled, because an
 * account may never delete itself (the data layer refuses it regardless).
 */
export function UserTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  /** The row whose Edit dialog is open, or null. */
  const [editing, setEditing] = useState<UserRow | null>(null);
  /** The row whose Delete confirmation is open, or null. */
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">No users to show.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
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
                Name
              </th>
              <th scope="col" className={headClasses}>
                Email
              </th>
              <th scope="col" className={headClasses}>
                Role
              </th>
              <th scope="col" className={headClasses}>
                Status
              </th>
              <th scope="col" className={headClasses}>
                Last sign-in
              </th>
              <th scope="col" className={headClasses}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row) => {
              const flags = accountFlags(row);
              const isSelf = row.id === currentUserId;

              return (
                <tr key={row.id} className="align-middle">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.name}
                      {isSelf ? <Pill>You</Pill> : null}
                    </div>
                  </td>
                  <td className={cellClasses}>{row.email}</td>
                  <td className={cellClasses}>
                    {row.is_admin === 1 ? (
                      <Pill tone="positive">Administrator</Pill>
                    ) : (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Standard</span>
                    )}
                  </td>
                  <td className={cellClasses}>
                    {flags.length === 0 ? (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {flags.map((flag) => (
                          <Pill key={flag.label} tone={flag.tone}>
                            {flag.label}
                          </Pill>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={cellClasses}>{formatDateTime(row.last_login_at)}</td>
                  <td className={cellClasses}>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={buttonClasses} onClick={() => setEditing(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={dangerClasses}
                        disabled={isSelf}
                        title={
                          isSelf
                            ? 'You cannot delete the account you are signed in with.'
                            : `Delete ${row.name}`
                        }
                        onClick={() => setDeleting(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? <UserEditDialog user={editing} onClose={() => setEditing(null)} /> : null}

      {deleting ? (
        <UserDeleteDialog
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(text) => setNotice({ tone: 'info', text })}
        />
      ) : null}
    </div>
  );
}