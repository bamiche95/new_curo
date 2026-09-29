import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { authenticateWithCredentials } from '@/lib/auth/login';
import { sessionCookieName, sessionCookieOptions, signSessionToken } from '@/lib/auth/session';

/**
 * JSON login endpoint: sets the same httpOnly session cookie as the login form.
 *
 *   curl -X POST http://localhost:3000/api/auth/login \
 *        -H "Content-Type: application/json" \
 *        -d '{"email":"you@example.com","password":"secret"}'
 */
export async function POST(request: Request) {
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: 'Expected a JSON request body.' }, { status: 400 });
  }

  const email = typeof payload.email === 'string' ? payload.email : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!email.trim() || !password) {
    return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 400 });
  }

  const result = await authenticateWithCredentials(email, password);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.locked ? 429 : 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), await signSessionToken(result.session), sessionCookieOptions());

  return NextResponse.json({
    user: {
      id: result.session.userId,
      name: result.session.name,
      email: result.session.email,
    },
  });
}
