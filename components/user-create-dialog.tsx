'use client';

import { useCallback, useState } from 'react';

import { Dialog } from '@/components/dialog';
import { UserForm, type UserFormValues } from '@/components/user-form';

const EMPTY_USER: UserFormValues = {
  name: '',
  email: '',
  isAdmin: false,
};

/**
 * "New user" as a modal, not a route.
 *
 * `opened` doubles as the form's `key`, so every open starts from a clean
 * `useActionState`, with no error or success message left over from the previous
 * attempt and no stale password in the field.
 */
export function UserCreateDialog() {
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
        New user
      </button>

      {opened > 0 ? (
        <Dialog
          title="New user"
          description="They can sign in as soon as they have a password; leave it blank to set up the account first."
          onClose={close}
        >
          <UserForm key={opened} mode="create" values={EMPTY_USER} onSuccess={close} onCancel={close} />
        </Dialog>
      ) : null}
    </>
  );
}