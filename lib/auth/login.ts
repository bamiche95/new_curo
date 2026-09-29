/**
 * Credential verification, shared by the login Server Action and the
 * `/api/auth/login` Route Handler so both go through identical logic.
 */
import 'server-only';

import { verifyPassword } from '@/lib/auth/password';
import type { SessionPayload } from '@/lib/auth/session';
import { queryOne, run } from '@/lib/db';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

export type AuthenticateResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; error: string; locked: boolean };

type LoginRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  token_version: number;
  failed_attempts: number;
  locked_until: Date | null;
};

/**
 * Looks the user up by email, enforces the lockout window and verifies the
 * bcrypt hash. Errors are deliberately generic so accounts cannot be enumerated.
 */
export async function authenticateWithCredentials(
  emailInput: string,
  password: string
): Promise<AuthenticateResult> {
  const email = emailInput.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: GENERIC_LOGIN_ERROR, locked: false };
  }

  const user = await queryOne<LoginRow>(
    `SELECT id, name, email, password_hash, token_version, failed_attempts, locked_until
       FROM users
      WHERE email = ?
      LIMIT 1`,
    [email]
  );

  // Unknown account, or an account whose password has not been set yet.
  if (!user || !user.password_hash) {
    return { ok: false, error: GENERIC_LOGIN_ERROR, locked: false };
  }

  const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.round((lockedUntil.getTime() - Date.now()) / 60_000));
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      locked: true,
    };
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  if (!passwordMatches) {
    const attempts = user.failed_attempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    try {
      await run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [
        shouldLock ? 0 : attempts,
        shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        user.id,
      ]);
    } catch (error) {
      console.error('[auth] failed to record failed login attempt', error);
    }

    return { ok: false, error: GENERIC_LOGIN_ERROR, locked: false };
  }

  try {
    await run(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
      [user.id]
    );
  } catch (error) {
    // Not fatal: the credentials were valid, so let the user in.
    console.error('[auth] failed to update login metadata', error);
  }

  return {
    ok: true,
    session: {
      userId: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.token_version,
    },
  };
}
