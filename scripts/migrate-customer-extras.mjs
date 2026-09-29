/**
 * Applies scripts/sql/002_customer_extras.sql to `curo_next_db`, idempotently.
 *
 *   npm run db:migrate-extras
 *
 * Every statement is checked against INFORMATION_SCHEMA before it runs, so this is
 * safe to run repeatedly. New statements can simply be appended to the .sql file.
 *
 * Note: the .sql file is split on `;`, so keep semicolons out of string literals.
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadEnv, newDbConfig } from './lib/load-env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(here, 'sql', '002_customer_extras.sql');

const NEW_TABLES = ['quote_types', 'customer_id_statuses', 'industries', 'quotes', 'customer_addresses', 'documents', 'customer_activity', 'user_saved_views', 'assignment_groups', 'assignment_group_members', 'customer_deletion_log'];

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
const columnExists = (table, column) =>
  anyRow('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
const indexExists = (table, index) =>
  anyRow('SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [table, index]);
const constraintExists = (table, constraint) =>
  anyRow('SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?', [table, constraint]);

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

    const alter = statement.match(/^ALTER TABLE `([^`]+)` ADD (COLUMN|KEY|INDEX|CONSTRAINT) `([^`]+)`/i);
    if (alter) {
      const [, table, kind, name] = alter;
      const upper = kind.toUpperCase();
      const present =
        upper === 'COLUMN'
          ? await columnExists(table, name)
          : upper === 'CONSTRAINT'
            ? await constraintExists(table, name)
            : await indexExists(table, name);

      if (present) {
        console.log(`⏭  ${table}.${name} (${upper.toLowerCase()}) already present`);
        skipped += 1;
        continue;
      }
      await conn.query(statement);
      console.log(`✅ added ${table}.${name} (${upper.toLowerCase()})`);
      applied += 1;
      continue;
    }

    console.log(`⚠️  unrecognised statement skipped: ${statement.slice(0, 70)}…`);
  }

  console.log(`\n📦 DDL summary: ${applied} applied, ${skipped} already present.`);

  const [columns] = await conn.query('SHOW COLUMNS FROM `customers`');
  console.log('\n--- customers ---');
  console.log(columns.map((column) => `${column.Field}:${column.Type}`).join(', '));

  const [foreignKeys] = await conn.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY COLUMN_NAME`
  );
  console.log(
    'customers foreign keys: ' +
      (foreignKeys.map((fk) => `${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME} (${fk.CONSTRAINT_NAME})`).join(', ') || 'none')
  );

  console.log('\n--- new tables ---');
  for (const table of NEW_TABLES) {
    const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    console.log(`  ${table}: ${rows[0].n} row(s)`);
  }

  console.log('\n🎉 Customer extras schema is up to date.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
