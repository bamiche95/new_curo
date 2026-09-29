'use server';

import { revalidatePath } from 'next/cache';

import {
  createUser,
  deleteUser,
  updateUser,
  type UserDeleteResult,
  type UserInput,
} from '@/lib/data/users';

/** Shape of the create/edit form's result, consumed by `useActionState`. */
export type UserFormState = {
  error?: string;
  /** Which field the error belongs to, so the form can highlight it. */
  field?: string;
  success?: string;
  /** Echoed back so a rejected submit never loses what was typed. */
  values?: Record<string, string>;
};

/**
 * Reads the form. Every value is untrusted — Server Actions are reachable by
 * direct POST — so the data layer re-checks the shape, the permissions, the email
 * uniqueness and the password strength. `isAdmin` is a checkbox, which submits
 * nothing when it is cleared, hence the `'on'` / `''` echo-back.
 *
 * The password is deliberately **not** echoed back: a rejected form must never put
 * a password into the HTML.
 */
function readUserForm(formData: FormData): { values: Record<string, string>; input: UserInput } {
  const name = String(formData.get('name') ?? '');
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const isAdmin = formData.get('isAdmin') !== null;

  return {
    values: { name, email, password: '', isAdmin: isAdmin ? 'on' : '' },
    input: { name, email, password, isAdmin },
  };
}

/**
 * Everything that shows a user has to be refreshed after a change: the list, the
 * hub's counters, and the customer screens, where an owner's name and the
 * "Assigned to" picklist come from the same table.
 */
function revalidateUserViews(): void {
  revalidatePath('/settings/users');
  revalidatePath('/settings');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
}

/** Adds an account and reports success as a value, so the modal can close itself. */
export async function createUserAction(_previous: UserFormState, formData: FormData): Promise<UserFormState> {
  const { values, input } = readUserForm(formData);
  const result = await createUser(input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateUserViews();

  return { success: `Added ${result.name}.` };
}

/** Saves an account (and any new temporary password). Administrators only. */
export async function updateUserAction(_previous: UserFormState, formData: FormData): Promise<UserFormState> {
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: 'Missing user.' };

  const { values, input } = readUserForm(formData);
  const result = await updateUser(userId, input);

  if (!result.ok) return { error: result.error, field: result.field, values };

  revalidateUserViews();

  return { values, success: 'User saved.' };
}

/**
 * Removes an account and reports what went with it. Administrators only, and never
 * their own account; both rules are enforced in the data layer, where a hand-made
 * request cannot bypass them.
 */
export async function deleteUserAction(input: { id: string }): Promise<UserDeleteResult> {
  // Server Actions are reachable by direct POST, so treat the argument as untrusted.
  const id = typeof input?.id === 'string' ? input.id : '';
  if (!id) return { ok: false, error: 'Missing user.' };

  const result = await deleteUser(id);
  if (!result.ok) return result;

  revalidateUserViews();

  return result;
}