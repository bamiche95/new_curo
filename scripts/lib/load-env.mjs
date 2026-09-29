/**
 * Minimal .env reader shared by the maintenance scripts, so they need no extra
 * dependencies and behave the same as the Next.js app (which loads .env itself).
 *
 * Values already present in the ambient environment win.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..', '..');

export function loadEnv() {
  try {
    const raw = readFileSync(join(projectRoot, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // No .env file: rely on the ambient environment.
  }
}

/** Connection options for the new application database (`curo_next_db`). */
export function newDbConfig() {
  return {
    host: process.env.NEW_DB_HOST || '127.0.0.1',
    port: Number(process.env.NEW_DB_PORT || 3307),
    user: process.env.NEW_DB_USER || 'root',
    password: process.env.NEW_DB_PASSWORD || '',
    database: process.env.NEW_DB_NAME || 'curo_next_db',
  };
}

/** Connection options for the legacy Vtiger source database. */
export function vtigerDbConfig() {
  return {
    host: process.env.VTIGER_DB_HOST || '127.0.0.1',
    port: Number(process.env.VTIGER_DB_PORT || 3307),
    user: process.env.VTIGER_DB_USER || 'root',
    password: process.env.VTIGER_DB_PASSWORD || '',
    database: process.env.VTIGER_DB_NAME || 'curoupgrade',
  };
}
