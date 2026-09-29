/**
 * Read and write queries for the industry lookup (`industries`).
 *
 * This is the least privileged screen in the app: any signed-in user may view the
 * list and add an industry, while changing or removing one is limited to
 * administrators. Every exported function re-verifies the session, and the
 * mutating ones re-check `isAdmin` themselves, because a 404 cannot stop a
 * direct POST.
 */
import 'server-only';

import { v4 as uuidv4 } from 'uuid';

import { verifySession } from '@/lib/auth/dal';
import { queryOne, queryOneOn, queryRows, run, runOn, withTransaction } from '@/lib/db';
import type { IndustryRow } from '@/lib/data/types';

/** Editing, switching off or removing a lookup entry is administrator-only. */
const ADMIN_ONLY_ERROR = 'Only administrators can do that.';

const CODE_MAX_LENGTH = 50;
const NAME_MAX_LENGTH = 100;

/** What the create/edit form submits: every field arrives as a string. */
export type IndustryInput = {
  code: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

export type IndustryWriteResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string; field?: string };

export type IndustryDeleteResult =
  | {
      ok: true;
      name: string;
      /** Customers left with no industry (`customers.industry_id` is ON DELETE SET NULL). */
      unlinked: number;
    }
  | { ok: false; error: string };

/**
 * Every industry, active or not, with how many live customers point at it.
 * The archived (soft deleted) customers are excluded from the count.
 */
const INDUSTRY_SELECT = `
        i.id,
        i.code,
        i.name,
        i.sort_order,
        i.is_active,
        i.created_at,
        COUNT(cu.id) AS customer_count
   FROM industries i
   LEFT JOIN customers cu ON cu.industry_id = i.id AND cu.deleted_at IS NULL`;

const INDUSTRY_GROUP_BY = 'GROUP BY i.id, i.code, i.name, i.sort_order, i.is_active, i.created_at';

/** The list screen: switched-off industries are kept (and badged) in their place. */
export async function listIndustries(): Promise<IndustryRow[]> {
  await verifySession();

  return queryRows<IndustryRow>(
    `SELECT ${INDUSTRY_SELECT}
      ${INDUSTRY_GROUP_BY}
      ORDER BY i.sort_order ASC, i.name ASC`
  );
}

/** `''` means "put it at the end of the list"; anything else has to be a whole number. */
function parseSortOrder(value: string): { ok: true; sortOrder: number | null } | { ok: false; error: string } {
  const raw = String(value ?? '').trim();
  if (raw === '') return { ok: true, sortOrder: null };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return { ok: false, error: 'Sort order has to be a whole number.' };
  }

  return { ok: true, sortOrder: parsed };
}

/** Shape checks shared by create and edit: both fields are required and length-capped. */
function readIndustryFields(input: {
  code?: string;
  name?: string;
}): { ok: true; code: string; name: string } | { ok: false; error: string; field: string } {
  const code = String(input?.code ?? '').trim();
  const name = String(input?.name ?? '').trim();

  if (code === '') return { ok: false, error: 'Give the industry a code.', field: 'code' };
  if (code.length > CODE_MAX_LENGTH) {
    return { ok: false, error: `Codes are at most ${CODE_MAX_LENGTH} characters.`, field: 'code' };
  }
  if (name === '') return { ok: false, error: 'Give the industry a name.', field: 'name' };
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Names are at most ${NAME_MAX_LENGTH} characters.`, field: 'name' };
  }

  return { ok: true, code, name };
}

/** The code column is UNIQUE, so a clash has to read as a form error, not a crash. */
function isDuplicateEntry(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'ER_DUP_ENTRY');
}

/**
 * Adds one industry to the picklist.
 *
 * Open to every signed-in user, so there is deliberately no `isAdmin` check here.
 * A non-administrator's entry is always active and appended to the end of the
 * list: the sort order and the active flag are *ignored* for them rather than
 * merely hidden in the form, so a hand-made POST cannot hide or reorder an
 * industry either.
 */
export async function createIndustry(input: IndustryInput): Promise<IndustryWriteResult> {
  const actor = await verifySession();

  const fields = readIndustryFields(input);
  if (!fields.ok) return fields;

  const sort = actor.isAdmin ? parseSortOrder(input?.sortOrder) : ({ ok: true, sortOrder: null } as const);
  if (!sort.ok) return { ok: false, error: sort.error, field: 'sortOrder' };

  const isActive = actor.isAdmin ? (input?.isActive ? 1 : 0) : 1;
  const id = uuidv4();

  try {
    await withTransaction(async (connection) => {
      // A blank sort order means "after everything else".
      let sortOrder = sort.sortOrder;
      if (sortOrder === null) {
        const row = await queryOneOn<{ next_sort_order: number }>(
          connection,
          'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM industries'
        );
        sortOrder = Number(row?.next_sort_order ?? 0);
      }

      await runOn(
        connection,
        'INSERT INTO industries (id, code, name, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
        [id, fields.code, fields.name, sortOrder, isActive]
      );
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: `The code "${fields.code}" is already used by another industry.`, field: 'code' };
    }
    console.error('[industries] create failed', error);
    return { ok: false, error: 'Could not add that industry. Please try again.' };
  }

  return { ok: true, id, name: fields.name };
}

/** Saves the whole industry. Administrators only. */
export async function updateIndustry(id: string, input: IndustryInput): Promise<IndustryWriteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing industry.' };

  const fields = readIndustryFields(input);
  if (!fields.ok) return fields;

  const sort = parseSortOrder(input?.sortOrder);
  if (!sort.ok) return { ok: false, error: sort.error, field: 'sortOrder' };

  const existing = await queryOne<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM industries WHERE id = ? LIMIT 1',
    [id]
  );
  if (!existing) return { ok: false, error: 'That industry no longer exists.' };

  try {
    // mysql2 enables CLIENT_FOUND_ROWS, so `affectedRows` counts *matched* rows.
    // Existence is still checked explicitly above, so a genuinely missing
    // industry reports "no longer exists" instead of a silent no-op.
    await run('UPDATE industries SET code = ?, name = ?, sort_order = ?, is_active = ? WHERE id = ?', [
      fields.code,
      fields.name,
      // A cleared sort order keeps the position it already holds.
      sort.sortOrder ?? Number(existing.sort_order),
      input?.isActive ? 1 : 0,
      id,
    ]);
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: `The code "${fields.code}" is already used by another industry.`, field: 'code' };
    }
    console.error('[industries] update failed', error);
    return { ok: false, error: 'Could not save that industry. Please try again.' };
  }

  return { ok: true, id, name: fields.name };
}

/**
 * Switches an industry on or off in the picklists. Administrators only.
 *
 * Switching off hides it from the customers table's Industry picklist while the
 * customers already using it keep showing its name, so it is the reversible
 * alternative to a delete.
 */
export async function setIndustryActive(
  id: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing industry.' };

  const existing = await queryOne<{ id: string }>('SELECT id FROM industries WHERE id = ? LIMIT 1', [id]);
  if (!existing) return { ok: false, error: 'That industry no longer exists.' };

  try {
    await run('UPDATE industries SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  } catch (error) {
    console.error('[industries] activate/deactivate failed', error);
    return { ok: false, error: 'Could not change that industry. Please try again.' };
  }

  return { ok: true };
}

/**
 * Removes an industry for good. Administrators only.
 *
 * No customer is ever deleted: `customers.industry_id` is `ON DELETE SET NULL`,
 * so the customers that used it survive with no industry — the archived ones
 * included. How many live customers that was is counted first and handed back,
 * so the caller can say so (and it matches the list's `customer_count`).
 */
export async function deleteIndustry(id: string): Promise<IndustryDeleteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing industry.' };

  try {
    return await withTransaction(async (connection) => {
      const industry = await queryOneOn<{ name: string }>(
        connection,
        'SELECT name FROM industries WHERE id = ? LIMIT 1',
        [id]
      );
      if (!industry) return { ok: false, error: 'That industry no longer exists.' };

      const counted = await queryOneOn<{ unlinked: number }>(
        connection,
        // Live customers only: the list's `customer_count` excludes archived
        // (soft deleted) ones, so the two numbers agree.
        'SELECT COUNT(*) AS unlinked FROM customers WHERE industry_id = ? AND deleted_at IS NULL',
        [id]
      );

      await runOn(connection, 'DELETE FROM industries WHERE id = ?', [id]);

      return { ok: true, name: industry.name, unlinked: Number(counted?.unlinked ?? 0) };
    });
  } catch (error) {
    console.error('[industries] delete failed', error);
    return { ok: false, error: 'Could not delete that industry. Please try again.' };
  }
}
