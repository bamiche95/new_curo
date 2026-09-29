/**
 * Data Access Layer: the authoritative authentication check.
 *
 * `proxy.ts` only performs an optimistic check for fast redirects. Every page,
 * Server Action and Route Handler must go through this module as well, so that
 * data is never served on the strength of Proxy alone.
 */
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { sessionCookieName, verifySessionToken } from '@/lib/auth/session';
import { queryOne } from '@/lib/db';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  /** Gate for the destructive screens (Archived customers: restore / permanent delete). */
  isAdmin: boolean;
};

type UserAuthRow = {
  id: string;
  name: string;
  email: string;
  must_change_password: number;
  token_version: number;
  is_admin: number;
};

/**
 * Resolves the signed-in user from the session cookie, or `null`.
 * Memoised per React render pass, so multiple components can call it freely.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(sessionCookieName())?.value);
  if (!session) return null;

  const user = await queryOne<UserAuthRow>(
    `SELECT id, name, email, must_change_password, token_version, is_admin
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [session.userId]
  );

  // A missing row, or a token issued before the last password change /
  // "log out everywhere", means the session is no longer valid.
  if (!user || user.token_version !== session.tokenVersion) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: Boolean(user.must_change_password),
    isAdmin: Boolean(user.is_admin),
  };
});

/** Use inside protected pages/layouts: redirects to the login page when signed out. */
export async function verifySession(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Use inside administrator-only pages: 404s for everyone else, so the screen is
 * invisible rather than a dead end. Server Actions call `verifySession()` and
 * check `isAdmin` themselves, because a 404 cannot stop a direct POST.
 */
export async function verifyAdminPage(): Promise<AuthUser> {
  const user = await verifySession();
  if (!user.isAdmin) notFound();
  return user;
}
