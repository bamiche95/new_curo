/**
 * Idempotently adds the authentication columns to the `users` table.
 *
 *   node scripts/migrate-auth.mjs
 *
 * Safe to run repeatedly: each column is checked against INFORMATION_SCHEMA first.
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Minimal .env reader so this script has no extra dependencies.
function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, '..', '.env');
  try {
    const raw = readFileSync(envPath, 'utf8');
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

loadEnv();

const COLUMNS = [
  { name: 'password_hash', ddl: "ADD COLUMN `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `email`" },
  { name: 'must_change_password', ddl: "ADD COLUMN `must_change_password` tinyint(1) NOT NULL DEFAULT 1 AFTER `password_hash`" },
  { name: 'token_version', ddl: "ADD COLUMN `token_version` int NOT NULL DEFAULT 0 AFTER `must_change_password`" },
  { name: 'failed_attempts', ddl: "ADD COLUMN `failed_attempts` int NOT NULL DEFAULT 0 AFTER `token_version`" },
  { name: 'locked_until', ddl: "ADD COLUMN `locked_until` datetime DEFAULT NULL AFTER `failed_attempts`" },
  { name: 'last_login_at', ddl: "ADD COLUMN `last_login_at` datetime DEFAULT NULL AFTER `locked_until`" },
  { name: 'password_changed_at', ddl: "ADD COLUMN `password_changed_at` datetime DEFAULT NULL AFTER `last_login_at`" },
  { name: 'is_admin', ddl: "ADD COLUMN `is_admin` tinyint(1) NOT NULL DEFAULT 0 AFTER `must_change_password`" },
];

const conn = await mysql.createConnection({
  host: process.env.NEW_DB_HOST || '127.0.0.1',
  port: Number(process.env.NEW_DB_PORT || 3307),
  user: process.env.NEW_DB_USER || 'root',
  password: process.env.NEW_DB_PASSWORD || '',
  database: process.env.NEW_DB_NAME || 'curo_next_db',
});

try {
  const [existing] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const present = new Set(existing.map((row) => row.COLUMN_NAME));

  for (const column of COLUMNS) {
    if (present.has(column.name)) {
      console.log(`⏭  users.${column.name} already exists`);
      continue;
    }
    await conn.query(`ALTER TABLE \`users\` ${column.ddl}`);
    console.log(`✅ added users.${column.name}`);
  }

  const [cols] = await conn.query('SHOW COLUMNS FROM `users`');
  console.log(`\nusers columns: ${cols.map((c) => c.Field).join(', ')}`);
  console.log('🎉 Auth schema is up to date.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
