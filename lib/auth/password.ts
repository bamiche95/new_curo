import 'server-only';

import bcrypt from 'bcryptjs';

/** bcrypt work factor. 12 is a good balance for a server-side login. */
const BCRYPT_COST = 12;

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt silently ignores everything past 72 bytes, so we reject longer input. */
export const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    // Malformed hash in the database: treat as a failed login rather than a crash.
    return false;
  }
}

/** Returns a human readable problem, or `null` when the password is acceptable. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes long.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}
