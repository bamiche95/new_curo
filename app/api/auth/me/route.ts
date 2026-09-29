import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/dal';

/**
 * Example protected Route Handler: returns the signed-in user or a 401.
 * `proxy.ts` already rejects unauthenticated `/api/*` calls, but the session is
 * checked again here so the endpoint is safe on its own.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ user });
}
