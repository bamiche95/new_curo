import 'server-only';

import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { databaseConfig } from '@/lib/env';

/** Values we ever bind into a statement. */
export type SqlParam = string | number | bigint | boolean | Date | null | undefined;

declare global {
  var __curoMysqlPool: Pool | undefined;
}

function createAppPool(): Pool {
  return createPool({
    ...databaseConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
  });
}

/**
 * Shared connection pool. Cached on `globalThis` so that Next.js dev-mode
 * hot reloads do not leak a new pool on every recompile.
 */
export function getPool(): Pool {
  if (!globalThis.__curoMysqlPool) {
    globalThis.__curoMysqlPool = createAppPool();
  }
  return globalThis.__curoMysqlPool;
}

/**
 * A pooled connection can be dropped by the server (idle `wait_timeout`, a dev
 * recompile, a network blip). Those errors surface as `Connection closed` /
 * `PROTOCOL_CONNECTION_LOST`; retry once with a fresh pool.
 */
const CONNECTION_LOST_CODES = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT']);

function isConnectionLost(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code ?? '';
  const message = (error as { message?: string }).message ?? '';
  return (
    CONNECTION_LOST_CODES.has(code) ||
    message.includes('Connection closed') ||
    message.includes('connection is in closed state')
  );
}

function resetPool(): void {
  const stale = globalThis.__curoMysqlPool;
  globalThis.__curoMysqlPool = undefined;
  if (stale) void stale.end().catch(() => undefined);
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isConnectionLost(error)) throw error;
    console.warn('[db] connection lost, retrying with a fresh pool');
    resetPool();
    return operation();
  }
}

/** Runs a SELECT and returns the typed rows. */
export async function queryRows<TRow>(sql: string, params: SqlParam[] = []): Promise<TRow[]> {
  return withRetry(async () => {
    const [rows] = await getPool().query<RowDataPacket[]>(sql, params);
    return rows as unknown as TRow[];
  });
}

export async function queryOne<TRow>(sql: string, params: SqlParam[] = []): Promise<TRow | undefined> {
  const rows = await queryRows<TRow>(sql, params);
  return rows[0];
}

/** Runs an INSERT/UPDATE/DELETE and returns the result header. */
export async function run(sql: string, params: SqlParam[] = []): Promise<ResultSetHeader> {
  return withRetry(async () => {
    const [result] = await getPool().query<ResultSetHeader>(sql, params);
    return result;
  });
}

/**
 * Runs `fn` against one pooled connection inside a transaction, so a change and
 * its audit row can never drift apart. Anything `fn` throws (or returns) ends the
 * transaction: `commit` on success, `rollback` on failure. No retry here — a lost
 * connection mid-transaction must surface instead of being replayed blindly.
 */
export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    try {
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    connection.release();
  }
}

/** `run` on an already-open transaction connection. */
export async function runOn(
  connection: PoolConnection,
  sql: string,
  params: SqlParam[] = []
): Promise<ResultSetHeader> {
  const [result] = await connection.query<ResultSetHeader>(sql, params);
  return result;
}

/** `queryOne` on an already-open transaction connection. */
export async function queryOneOn<TRow>(
  connection: PoolConnection,
  sql: string,
  params: SqlParam[] = []
): Promise<TRow | undefined> {
  const [rows] = await connection.query<RowDataPacket[]>(sql, params);
  return (rows as unknown as TRow[])[0];
}

/** `queryRows` on an already-open transaction connection. */
export async function queryRowsOn<TRow>(
  connection: PoolConnection,
  sql: string,
  params: SqlParam[] = []
): Promise<TRow[]> {
  const [rows] = await connection.query<RowDataPacket[]>(sql, params);
  return rows as unknown as TRow[];
}

