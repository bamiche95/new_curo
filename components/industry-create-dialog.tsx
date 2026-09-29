'use client';

import { useCallback, useState } from 'react';

import { Dialog } from '@/components/dialog';
import { IndustryForm, type IndustryFormValues } from '@/components/industry-form';

const EMPTY_INDUSTRY: IndustryFormValues = {
  code: '',
  name: '',
  sortOrder: '',
  isActive: true,
};

/**
 * "New industry" as a modal, not a route.
 *
 * Adding an industry is a two-field job, so a dialog keeps the reader on the list
 * they were looking at — and that list has already been refreshed by the action's
 * revalidation by the time it closes. `opened` doubles as the form's `key`, so
 * every open starts from a clean `useActionState`, with no error or success
 * message left over from the previous attempt.
 */
export function IndustryCreateDialog({ canManage }: { canManage: boolean }) {
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
        New industry
      </button>

      {opened > 0 ? (
        <Dialog
          title="New industry"
          description="It appears in the customers table's Industry picklist straight away."
          onClose={close}
        >
          <IndustryForm
            key={opened}
            mode="create"
            values={EMPTY_INDUSTRY}
            canManage={canManage}
            onSuccess={close}
            onCancel={close}
          />
        </Dialog>
      ) : null}
    </>
  );
}