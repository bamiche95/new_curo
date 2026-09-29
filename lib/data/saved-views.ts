/**
 * Per-user saved table views (columns, filters, sort, page size).
 * Every function is scoped to the signed-in user.
 */
import 'server-only';

import { v4 as uuidv4 } from 'uuid';

import { getCurrentUser } from '@/lib/auth/dal';
import { CUSTOMER_ENTITY, type CustomerQueryState } from '@/lib/customer-query';
import { queryOne, queryRows, run } from '@/lib/db';
import type { SavedViewRow } from '@/lib/data/types';

type RawViewRow = {
  id: string;
  name: string;
  is_default: number;
  page_size: number;
  columns: unknown;
  filters: unknown;
  sort: unknown;
  updated_at: Date;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function toView(row: RawViewRow): SavedViewRow {
  const filters = parseJson<{ values?: Record<string, string[]>; ranges?: SavedViewRow['ranges'] }>(row.filters, {});
  const sort = parseJson<{ key: string; dir: 'asc' | 'desc' } | null>(row.sort, null);

  return {
    id: row.id,
    name: row.name,
    is_default: row.is_default,
    page_size: row.page_size,
    columns: parseJson<string[]>(row.columns, []),
    filters: filters.values ?? {},
    ranges: filters.ranges ?? {},
    sort: sort && typeof sort.key === 'string' ? sort : null,
    updated_at: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export async function listSavedViews(entity: string = CUSTOMER_ENTITY): Promise<SavedViewRow[]> {
  const userId = await requireUserId();

  const rows = await queryRows<RawViewRow>(
    `SELECT id, name, is_default, page_size, columns, filters, sort, updated_at
       FROM user_saved_views
      WHERE user_id = ? AND entity = ?
      ORDER BY is_default DESC, name ASC`,
    [userId, entity]
  );

  return rows.map(toView);
}

export async function getSavedView(id: string, entity: string = CUSTOMER_ENTITY): Promise<SavedViewRow | null> {
  const userId = await requireUserId();

  const row = await queryOne<RawViewRow>(
    `SELECT id, name, is_default, page_size, columns, filters, sort, updated_at
       FROM user_saved_views
      WHERE id = ? AND user_id = ? AND entity = ?
      LIMIT 1`,
    [id, userId, entity]
  );

  return row ? toView(row) : null;
}

/** Creates, updates or (by reusing a name) overwrites a view. Returns its id. */
export async function saveSavedView(input: {
  id?: string | null;
  name: string;
  state: CustomerQueryState;
  entity?: string;
}): Promise<string> {
  const userId = await requireUserId();
  const entity = input.entity ?? CUSTOMER_ENTITY;
  const name = input.name.trim();

  if (!name) throw new Error('A view name is required.');
  if (name.length > 100) throw new Error('View names are limited to 100 characters.');

  const columns = JSON.stringify(input.state.cols);
  const filters = JSON.stringify({ values: input.state.filters, ranges: input.state.ranges });
  const sort = JSON.stringify({ key: input.state.sort, dir: input.state.dir });

  if (input.id) {
    const result = await run(
      `UPDATE user_saved_views
          SET name = ?, columns = ?, filters = ?, sort = ?, page_size = ?
        WHERE id = ? AND user_id = ? AND entity = ?`,
      [name, columns, filters, sort, input.state.size, input.id, userId, entity]
    );
    if (result.affectedRows > 0) return input.id;
  }

  await run(
    `INSERT INTO user_saved_views (id, user_id, entity, name, columns, filters, sort, page_size, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
       columns = VALUES(columns),
       filters = VALUES(filters),
       sort = VALUES(sort),
       page_size = VALUES(page_size)`,
    [uuidv4(), userId, entity, name, columns, filters, sort, input.state.size]
  );

  const row = await queryOne<{ id: string }>(
    'SELECT id FROM user_saved_views WHERE user_id = ? AND entity = ? AND name = ? LIMIT 1',
    [userId, entity, name]
  );

  if (!row) throw new Error('Could not save the view.');
  return row.id;
}

export async function deleteSavedView(id: string, entity: string = CUSTOMER_ENTITY): Promise<boolean> {
  const userId = await requireUserId();

  const result = await run('DELETE FROM user_saved_views WHERE id = ? AND user_id = ? AND entity = ?', [
    id,
    userId,
    entity,
  ]);

  return result.affectedRows > 0;
}

/** Marks one view as the user's landing view (clearing the flag on the others). */
export async function makeDefaultView(id: string, entity: string = CUSTOMER_ENTITY): Promise<boolean> {
  const userId = await requireUserId();

  const result = await run('UPDATE user_saved_views SET is_default = 0 WHERE user_id = ? AND entity = ?', [
    userId,
    entity,
  ]);

  if (result.affectedRows < 0) return false;

  const updated = await run(
    'UPDATE user_saved_views SET is_default = 1 WHERE id = ? AND user_id = ? AND entity = ?',
    [id, userId, entity]
  );

  return updated.affectedRows > 0;
}

export async function getDefaultView(entity: string = CUSTOMER_ENTITY): Promise<SavedViewRow | null> {
  const userId = await requireUserId();

  const row = await queryOne<RawViewRow>(
    `SELECT id, name, is_default, page_size, columns, filters, sort, updated_at
       FROM user_saved_views
      WHERE user_id = ? AND entity = ? AND is_default = 1
      LIMIT 1`,
    [userId, entity]
  );

  return row ? toView(row) : null;
}
