/**
 * Read and write queries for the customer status lookup
 * (`/settings/customer-statuses`).
 *
 * The same split as the industries screen: any signed-in user may view the list
 * and add a status, while changing, reordering, switching off or removing one is
 * limited to administrators. Every exported function re-verifies the session, and
 * the mutating ones re-check `isAdmin` themselves, because a 404 cannot stop a
 * direct POST.
 */
import 'server-only';

import { v4 as uuidv4 } from 'uuid';

import { verifySession } from '@/lib/auth/dal';
import { queryOne, queryOneOn, queryRows, run, runOn, withTransaction } from '@/lib/db';
import type { CustomerStatusRow } from '@/lib/data/types';

/** Editing, switching off or removing a status is administrator-only. */
const ADMIN_ONLY_ERROR = 'Only administrators can do that.';

const CODE_MAX_LENGTH = 50;
const NAME_MAX_LENGTH = 100;
/** The colour lands in a CSS `background-color`, so only hex is accepted. */
const COLOUR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** What the create/edit form submits: every field arrives as a string. */
export type CustomerStatusInput = {
  code: string;
  name: string;
  colour: string;
  sortOrder: string;
  isActive: boolean;
};

export type CustomerStatusWriteResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string; field?: string };

export type CustomerStatusDeleteResult =
  | {
      ok: true;
      name: string;
      /** Customers left with no status (`customers.customer_id_status_id` is ON DELETE SET NULL). */
      unlinked: number;
    }
  | { ok: false; error: string };

/**
 * Every status, active or not, with how many live customers hold it. The archived
 * (soft deleted) customers are excluded from the count.
 */
const STATUS_SELECT = `
        s.id,
        s.code,
        s.name,
        s.colour,
        s.sort_order,
        s.is_active,
        s.created_at,
        COUNT(cu.id) AS customer_count
   FROM customer_id_statuses s
   LEFT JOIN customers cu ON cu.customer_id_status_id = s.id AND cu.deleted_at IS NULL`;

const STATUS_GROUP_BY =
  'GROUP BY s.id, s.code, s.name, s.colour, s.sort_order, s.is_active, s.created_at';

/** The list screen: switched-off statuses are kept (and badged) in their place. */
export async function listCustomerStatuses(): Promise<CustomerStatusRow[]> {
  await verifySession();

  return queryRows<CustomerStatusRow>(
    `SELECT ${STATUS_SELECT}
      ${STATUS_GROUP_BY}
      ORDER BY s.sort_order ASC, s.name ASC`
  );
}

/** `''` means "no colour": the badge falls back to its own grey. */
function readColour(value: string): { ok: true; colour: string | null } | { ok: false; error: string } {
  const raw = String(value ?? '').trim();
  if (raw === '') return { ok: true, colour: null };
  if (!COLOUR_PATTERN.test(raw)) {
    return { ok: false, error: 'Use a hex colour such as #f59e0b, or leave the field blank.' };
  }

  return { ok: true, colour: raw.toLowerCase() };
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
function readStatusFields(input: {
  code?: string;
  name?: string;
}): { ok: true; code: string; name: string } | { ok: false; error: string; field: string } {
  const code = String(input?.code ?? '').trim();
  const name = String(input?.name ?? '').trim();

  if (code === '') return { ok: false, error: 'Give the status a code.', field: 'code' };
  if (code.length > CODE_MAX_LENGTH) {
    return { ok: false, error: `Codes are at most ${CODE_MAX_LENGTH} characters.`, field: 'code' };
  }
  if (name === '') return { ok: false, error: 'Give the status a name.', field: 'name' };
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
 * Adds a status to the picklist.
 *
 * Open to every signed-in user, so there is deliberately no `isAdmin` check here.
 * A non-administrator's entry is always active and appended to the end of the
 * list: the sort order and the active flag are *ignored* for them rather than
 * merely hidden in the form, so a hand-made POST cannot hide or reorder a status
 * either. The colour is theirs to choose — it is part of adding a status.
 */
export async function createCustomerStatus(input: CustomerStatusInput): Promise<CustomerStatusWriteResult> {
  const actor = await verifySession();

  const fields = readStatusFields(input);
  if (!fields.ok) return fields;

  const colour = readColour(input?.colour);
  if (!colour.ok) return { ok: false, error: colour.error, field: 'colour' };

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
          'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM customer_id_statuses'
        );
        sortOrder = Number(row?.next_sort_order ?? 0);
      }

      await runOn(
        connection,
        'INSERT INTO customer_id_statuses (id, code, name, colour, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [id, fields.code, fields.name, colour.colour, sortOrder, isActive]
      );
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: `The code "${fields.code}" is already used by another status.`, field: 'code' };
    }
    console.error('[statuses] create failed', error);
    return { ok: false, error: 'Could not add that status. Please try again.' };
  }

  return { ok: true, id, name: fields.name };
}

/** Saves the whole status. Administrators only. */
export async function updateCustomerStatus(
  id: string,
  input: CustomerStatusInput
): Promise<CustomerStatusWriteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing status.' };

  const fields = readStatusFields(input);
  if (!fields.ok) return fields;

  const colour = readColour(input?.colour);
  if (!colour.ok) return { ok: false, error: colour.error, field: 'colour' };

  const sort = parseSortOrder(input?.sortOrder);
  if (!sort.ok) return { ok: false, error: sort.error, field: 'sortOrder' };

  const existing = await queryOne<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM customer_id_statuses WHERE id = ? LIMIT 1',
    [id]
  );
  if (!existing) return { ok: false, error: 'That status no longer exists.' };

  try {
    // mysql2 enables CLIENT_FOUND_ROWS, so `affectedRows` counts *matched* rows.
    // Existence is still checked explicitly above, so a genuinely missing status
    // reports "no longer exists" instead of a silent no-op.
    await run(
      'UPDATE customer_id_statuses SET code = ?, name = ?, colour = ?, sort_order = ?, is_active = ? WHERE id = ?',
      [
        fields.code,
        fields.name,
        colour.colour,
        // A cleared sort order keeps the position it already holds.
        sort.sortOrder ?? Number(existing.sort_order),
        input?.isActive ? 1 : 0,
        id,
      ]
    );
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: `The code "${fields.code}" is already used by another status.`, field: 'code' };
    }
    console.error('[statuses] update failed', error);
    return { ok: false, error: 'Could not save that status. Please try again.' };
  }

  return { ok: true, id, name: fields.name };
}

/**
 * Switches a status on or off in the picklists. Administrators only.
 *
 * Switching off hides it from the customers table's Status picklist while the
 * customers already holding it keep showing its name, so it is the reversible
 * alternative to a delete.
 */
export async function setCustomerStatusActive(
  id: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing status.' };

  const existing = await queryOne<{ id: string }>('SELECT id FROM customer_id_statuses WHERE id = ? LIMIT 1', [id]);
  if (!existing) return { ok: false, error: 'That status no longer exists.' };

  try {
    await run('UPDATE customer_id_statuses SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  } catch (error) {
    console.error('[statuses] activate/deactivate failed', error);
    return { ok: false, error: 'Could not change that status. Please try again.' };
  }

  return { ok: true };
}

/**
 * Removes a status for good. Administrators only.
 *
 * No customer is ever deleted: `customers.customer_id_status_id` is
 * `ON DELETE SET NULL`, so the customers that held it survive with no status. How
 * many live customers that was is counted first and handed back, so the caller can
 * say so (and it matches the list's `customer_count`).
 */
export async function deleteCustomerStatus(id: string): Promise<CustomerStatusDeleteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing status.' };

  try {
    return await withTransaction(async (connection) => {
      const status = await queryOneOn<{ name: string }>(
        connection,
        'SELECT name FROM customer_id_statuses WHERE id = ? LIMIT 1',
        [id]
      );
      if (!status) return { ok: false, error: 'That status no longer exists.' };

      const counted = await queryOneOn<{ unlinked: number }>(
        connection,
        // Live customers only: the list's `customer_count` excludes archived
        // (soft deleted) ones, so the two numbers agree.
        'SELECT COUNT(*) AS unlinked FROM customers WHERE customer_id_status_id = ? AND deleted_at IS NULL',
        [id]
      );

      await runOn(connection, 'DELETE FROM customer_id_statuses WHERE id = ?', [id]);

      return { ok: true, name: status.name, unlinked: Number(counted?.unlinked ?? 0) };
    });
  } catch (error) {
    console.error('[statuses] delete failed', error);
    return { ok: false, error: 'Could not delete that status. Please try again.' };
  }
}
