/**
 * Stateless session tokens (JWT, HS256).
 *
 * This module is intentionally dependency-light (jose + env only) so that it can
 * be imported from `proxy.ts` as well as from Server Components, Server Actions
 * and Route Handlers. It must never import `next/headers` or the database.
 */
import { SignJWT, jwtVerify } from 'jose';

import { authConfig, jwtSigningKey } from '@/lib/env';

const ALGORITHM = 'HS256';
const ISSUER = 'curo-next';
const AUDIENCE = 'curo-dashboard';

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  /** Mirrors `users.token_version`; bumping it invalidates all issued tokens. */
  tokenVersion: number;
};

export async function signSessionToken(
  payload: SessionPayload,
  ttlSeconds: number = authConfig().sessionTtlSeconds
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: payload.email,
    name: payload.name,
    ver: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(jwtSigningKey());
}

/** Verifies signature, issuer, audience and expiry. Returns `null` when invalid. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, jwtSigningKey(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    const tokenVersion = typeof payload.ver === 'number' ? payload.ver : null;
    if (!userId || tokenVersion === null) return null;

    return {
      userId,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      tokenVersion,
    };
  } catch {
    return null;
  }
}

export function sessionCookieName(): string {
  return authConfig().cookieName;
}

export type SessionCookieOptions = {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
};

/**
 * Cookie flags for the session token.
 * httpOnly keeps the JWT away from client-side JavaScript; sameSite=lax plus
 * Next.js' built-in Server Action origin checks cover CSRF for form posts.
 */
export function sessionCookieOptions(maxAge: number = authConfig().sessionTtlSeconds): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: authConfig().isProduction,
    path: '/',
    maxAge,
  };
}

/**
 * Only allow internal, single-slash paths as post-login redirect targets so a
 * crafted `?next=//evil.example` cannot turn the login form into an open redirect.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = '/dashboard'): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback;
  return candidate;
}
