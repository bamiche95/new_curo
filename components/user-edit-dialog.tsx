'use client';

import { Dialog } from '@/components/dialog';
import { UserForm, type UserFormValues } from '@/components/user-form';
import type { UserRow } from '@/lib/data/types';

/**
 * Editing one account, in a modal over the list.
 *
 * The values come straight from the row the table is showing. Leaving the password
 * field blank keeps the current password — handy for a rename — while filling it in
 * issues a temporary one, clears any lockout and signs that account out everywhere.
 * Administrators only: the page is gated, and the data layer re-checks the flag for
 * anything that arrives as a direct POST.
 */
export function UserEditDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const values: UserFormValues = {
    name: user.name,
    email: user.email,
    isAdmin: user.is_admin === 1,
  };

  return (
    <Dialog
      title={`Edit ${user.name}`}
      description="The email address is what they sign in with; a temporary password is changed at their next sign-in."
      onClose={onClose}
    >
      <UserForm mode="edit" userId={user.id} values={values} onSuccess={onClose} onCancel={onClose} />
    </Dialog>
  );
}