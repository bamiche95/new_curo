/**
 * Centralised environment access.
 *
 * Values are read lazily (inside functions) so that a missing variable only
 * fails at the point of use, with a clear message, instead of breaking builds.
 */

const DEFAULT_DB_PORT = 3307;
const DEFAULT_SESSION_TTL_DAYS = 7;
const DEFAULT_COOKIE_NAME = 'curo_session';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". Add it to .env (see .env.example).`
    );
  }
  return value;
}

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

/** Connection settings for the new application database (`curo_next_db`). */
export function databaseConfig(): DatabaseConfig {
  return {
    host: process.env.NEW_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.NEW_DB_PORT ?? DEFAULT_DB_PORT),
    user: process.env.NEW_DB_USER ?? 'root',
    password: process.env.NEW_DB_PASSWORD ?? '',
    database: process.env.NEW_DB_NAME ?? 'curo_next_db',
  };
}

export type AuthConfig = {
  cookieName: string;
  sessionTtlSeconds: number;
  isProduction: boolean;
};

export function authConfig(): AuthConfig {
  const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? DEFAULT_SESSION_TTL_DAYS);
  return {
    cookieName: process.env.SESSION_COOKIE_NAME ?? DEFAULT_COOKIE_NAME,
    sessionTtlSeconds: (Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_SESSION_TTL_DAYS) * 86_400,
    isProduction: process.env.NODE_ENV === 'production',
  };
}

/** HS256 signing key, derived from `JWT_SECRET`. */
export function jwtSigningKey(): Uint8Array {
  return new TextEncoder().encode(required('JWT_SECRET'));
}
