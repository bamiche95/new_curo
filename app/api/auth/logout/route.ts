import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { sessionCookieName } from '@/lib/auth/session';

/** Clears the session cookie. Returns 401 when there was nothing to clear. */
export async function POST() {
  const cookieStore = await cookies();
  const hadSession = cookieStore.has(sessionCookieName());
  cookieStore.delete(sessionCookieName());

  return NextResponse.json({ ok: true, hadSession });
}
