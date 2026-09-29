'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/dal';
import { authenticateWithCredentials } from '@/lib/auth/login';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/auth/password';
import {
  safeRedirectPath,
  sessionCookieName,
  sessionCookieOptions,
  signSessionToken,
} from '@/lib/auth/session';
import { authConfig } from '@/lib/env';
import { queryOne, run } from '@/lib/db';

const MISSING_CREDENTIALS_ERROR = 'Enter your email address and password.';

export type LoginState = {
  error?: string;
  email?: string;
};

export type ChangePasswordState = {
  error?: string;
  success?: string;
};

/**
 * Validates credentials, issues a JWT session cookie and redirects.
 * Intended to be used with React's `useActionState`.
 */
export async function loginAction(previousState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const nextPath = safeRedirectPath(String(formData.get('next') ?? ''));

  if (!email || !password) {
    return { error: MISSING_CREDENTIALS_ERROR, email };
  }

  const result = await authenticateWithCredentials(email, password).catch((error: unknown) => {
    console.error('[auth] login failed', error);
    return null;
  });

  if (!result) {
    return { error: 'Unable to sign in right now. Please try again.', email };
  }

  if (!result.ok) {
    return { error: result.error, email };
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), await signSessionToken(result.session), sessionCookieOptions());

  revalidatePath('/', 'layout');

  // `redirect` throws a control-flow exception, so it must stay outside try/catch.
  redirect(nextPath);
}

/** Clears the session cookie and returns to the login page. */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName());
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Lets a signed-in user replace the password an administrator set for them.
 * Bumping `token_version` keeps the current device signed in while invalidating
 * every other outstanding token.
 */
export async function changePasswordAction(
  previousState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'Fill in all three fields.' };
  }
  if (newPassword !== confirmPassword) {
    return { error: 'The new password and confirmation do not match.' };
  }
  if (newPassword === currentPassword) {
    return { error: 'Choose a new password that differs from your current one.' };
  }

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) return { error: strengthError };

  const row = await queryOne<{ id: string; password_hash: string | null; token_version: number }>(
    'SELECT id, password_hash, token_version FROM users WHERE id = ? LIMIT 1',
    [currentUser.id]
  );

  if (!row || !row.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
    return { error: 'Your current password is incorrect.' };
  }

  const passwordHash = await hashPassword(newPassword);
  const newTokenVersion = row.token_version + 1;

  await run(
    `UPDATE users
        SET password_hash = ?,
            must_change_password = 0,
            token_version = ?,
            password_changed_at = NOW(),
            failed_attempts = 0,
            locked_until = NULL
      WHERE id = ?`,
    [passwordHash, newTokenVersion, currentUser.id]
  );

  const token = await signSessionToken(
    {
      userId: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      tokenVersion: newTokenVersion,
    },
    authConfig().sessionTtlSeconds
  );
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), token, sessionCookieOptions());

  revalidatePath('/', 'layout');

  return { success: 'Your password has been updated.' };
}
