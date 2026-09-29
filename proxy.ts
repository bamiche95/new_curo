/**
 * Next.js 16 Proxy (the successor to `middleware.ts`).
 *
 * Performs an optimistic JWT check so unauthenticated visitors are redirected
 * before any route renders, and so `/api/*` returns JSON instead of HTML.
 * The authoritative check still happens in `lib/auth/dal.ts` (see the
 * Authentication guide: Proxy must not be your only line of defence).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { safeRedirectPath, sessionCookieName, verifySessionToken } from '@/lib/auth/session';

/** Route prefixes reachable without a session. */
const PUBLIC_PAGE_PREFIXES = ['/login'];
const PUBLIC_API_PREFIXES = ['/api/auth/login'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(sessionCookieName())?.value);
  const isAuthenticated = session !== null;

  // API routes: never redirect, answer with a 401 the caller can handle.
  if (pathname.startsWith('/api')) {
    if (matchesPrefix(pathname, PUBLIC_API_PREFIXES)) return NextResponse.next();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const isPublicPage = matchesPrefix(pathname, PUBLIC_PAGE_PREFIXES);

  if (!isAuthenticated && !isPublicPage) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', safeRedirectPath(`${pathname}${search}`));
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isPublicPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next.js internals, the favicon and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|woff|woff2|ttf)$).*)',
  ],
};
