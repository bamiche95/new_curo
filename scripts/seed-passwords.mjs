/**
 * Seeds bcrypt password hashes into `users.password_hash`.
 *
 *   node scripts/seed-passwords.mjs --email peter.iteka@recman.com --password "Str0ng!Pass"
 *   node scripts/seed-passwords.mjs --all --password "TempPass#2026"
 *   node scripts/seed-passwords.mjs --all --password "TempPass#2026" --force
 *
 * Options:
 *   --email <address>   target a single user (case-insensitive)
 *   --all               target every row in `users`
 *   --password <value>  the password to hash (8-72 characters)
 *   --force             overwrite an existing password_hash
 *   --cost <n>          bcrypt cost factor (default 12)
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const raw = readFileSync(join(here, '..', '.env'), 'utf8');
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

function parseArgs(argv) {
  const args = { all: false, force: false, cost: 12, email: null, password: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') args.all = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--email') args.email = argv[++i] ?? null;
    else if (arg === '--password') args.password = argv[++i] ?? null;
    else if (arg === '--cost') args.cost = Number(argv[++i] ?? 12);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const USAGE = `Usage:
  node scripts/seed-passwords.mjs --email <address> --password <value> [--force] [--cost 12]
  node scripts/seed-passwords.mjs --all --password <value> [--force] [--cost 12]`;

loadEnv();

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`❌ ${err.message}\n\n${USAGE}`);
  process.exit(1);
}

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

if (!args.email && !args.all) {
  console.error(`❌ Provide --email <address> or --all.\n\n${USAGE}`);
  process.exit(1);
}

if (!args.password) {
  console.error(`❌ Provide --password <value>.\n\n${USAGE}`);
  process.exit(1);
}

if (args.password.length < 8) {
  console.error('❌ Password must be at least 8 characters long.');
  process.exit(1);
}

// bcrypt only considers the first 72 bytes; refuse silently-truncated passwords.
if (Buffer.byteLength(args.password, 'utf8') > 72) {
  console.error('❌ Password must be at most 72 bytes long (bcrypt limit).');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.NEW_DB_HOST || '127.0.0.1',
  port: Number(process.env.NEW_DB_PORT || 3307),
  user: process.env.NEW_DB_USER || 'root',
  password: process.env.NEW_DB_PASSWORD || '',
  database: process.env.NEW_DB_NAME || 'curo_next_db',
});

try {
  const [targets] = args.all
    ? await conn.query('SELECT id, name, email, password_hash FROM users ORDER BY name')
    : await conn.query('SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = LOWER(?)', [args.email]);

  if (targets.length === 0) {
    console.error(`❌ No user found for ${args.all ? '--all' : args.email}`);
    process.exitCode = 1;
  } else {
    const hash = await bcrypt.hash(args.password, args.cost);
    let updated = 0;
    let skipped = 0;

    for (const user of targets) {
      if (user.password_hash && !args.force) {
        console.log(`⏭  ${user.email} (${user.name}) already has a password - use --force to overwrite`);
        skipped += 1;
        continue;
      }
      await conn.query(
        `UPDATE users
            SET password_hash = ?,
                must_change_password = 1,
                token_version = token_version + 1,
                failed_attempts = 0,
                locked_until = NULL,
                password_changed_at = NOW()
          WHERE id = ?`,
        [hash, user.id]
      );
      console.log(`✅ ${user.email} (${user.name})`);
      updated += 1;
    }

    console.log(`\n💾 Seeded ${updated} password(s), skipped ${skipped}.`);
    console.log('ℹ️  Every seeded account is flagged must_change_password = 1.');
  }
} catch (err) {
  console.error('❌ Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
