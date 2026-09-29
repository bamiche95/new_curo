/**
 * Applies scripts/sql/003_communication_mentions.sql to `curo_next_db`, idempotently.
 *
 *   npm run db:migrate-mentions
 *
 * The statement is checked against INFORMATION_SCHEMA first, so this is safe to run
 * repeatedly.
 *
 * Note: the .sql file is split on `;`, so keep semicolons out of string literals.
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadEnv, newDbConfig } from './lib/load-env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(here, 'sql', '003_communication_mentions.sql');

const NEW_TABLES = ['communication_mentions'];

loadEnv();

let conn;
try {
  conn = await mysql.createConnection(newDbConfig());
} catch (err) {
  console.error('❌ Could not connect to the database:', err.message);
  process.exit(1);
}

const anyRow = async (sql, params) => {
  const [rows] = await conn.query(sql, params);
  return rows.length > 0;
};

const tableExists = (table) =>
  anyRow('SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);

const statements = readFileSync(SQL_PATH, 'utf8')
  .split(';')
  .map((chunk) =>
    chunk
      .split(/\r?\n/)
      .filter((line) => !/^\s*--/.test(line))
      .join('\n')
      .trim()
  )
  .filter((statement) => statement.length > 0);

try {
  let applied = 0;
  let skipped = 0;

  for (const statement of statements) {
    const createTable = statement.match(/^CREATE TABLE IF NOT EXISTS `([^`]+)`/);
    if (createTable) {
      const table = createTable[1];
      if (await tableExists(table)) {
        console.log(`⏭  table ${table} already exists`);
        skipped += 1;
        continue;
      }
      await conn.query(statement);
      console.log(`✅ created table ${table}`);
      applied += 1;
      continue;
    }

    console.log(`⚠️  unrecognised statement skipped: ${statement.slice(0, 70)}…`);
  }

  console.log(`\n📦 DDL summary: ${applied} applied, ${skipped} already present.`);

  console.log('\n--- new tables ---');
  for (const table of NEW_TABLES) {
    const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    console.log(`  ${table}: ${rows[0].n} row(s)`);
  }

  const [constraints] = await conn.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'communication_mentions'
      ORDER BY CONSTRAINT_TYPE, CONSTRAINT_NAME`
  );
  console.log(
    '  constraints: ' + (constraints.map((row) => `${row.CONSTRAINT_NAME} (${row.CONSTRAINT_TYPE})`).join(', ') || 'none')
  );

  console.log('\n🎉 Comment mentions schema is up to date.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
