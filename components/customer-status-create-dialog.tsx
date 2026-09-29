'use client';

import { useCallback, useState } from 'react';

import { Dialog } from '@/components/dialog';
import {
  CustomerStatusForm,
  type CustomerStatusFormValues,
} from '@/components/customer-status-form';

const EMPTY_STATUS: CustomerStatusFormValues = {
  code: '',
  name: '',
  colour: '',
  sortOrder: '',
  isActive: true,
};

/**
 * "New status" as a modal, not a route — and open to every signed-in user, so it is
 * rendered without an admin check (what a non-administrator may set is decided by
 * the data layer, which ignores the sort order and the active flag for them).
 *
 * `opened` doubles as the form's `key`, so every open starts from a clean
 * `useActionState`, with no error or success message left over.
 */
export function CustomerStatusCreateDialog({ canManage }: { canManage: boolean }) {
  /** 0 = closed; each open bumps the counter so the form starts fresh. */
  const [opened, setOpened] = useState(0);

  const open = useCallback(() => setOpened((count) => count + 1), []);
  const close = useCallback(() => setOpened(0), []);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        New status
      </button>

      {opened > 0 ? (
        <Dialog
          title="New status"
          description="It appears in the customers table's Status picklist straight away."
          onClose={close}
        >
          <CustomerStatusForm
            key={opened}
            mode="create"
            values={EMPTY_STATUS}
            canManage={canManage}
            onSuccess={close}
            onCancel={close}
          />
        </Dialog>
      ) : null}
    </>
  );
}