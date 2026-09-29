/**
 * Read queries for the customer screens.
 *
 * Every exported function re-verifies the session, so these can never be read by
 * an unauthenticated caller even if Proxy were bypassed.
 */
import 'server-only';

import type { PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

import { verifySession, type AuthUser } from '@/lib/auth/dal';
import {
  editableColumn,
  type CellUpdateResult,
  type CustomerQueryState,
} from '@/lib/customer-query';
import {
  queryOne,
  queryOneOn,
  queryRows,
  queryRowsOn,
  runOn,
  withTransaction,
  type SqlParam,
} from '@/lib/db';
import type {
  ActivityRow,
  AddressRow,
  ArchivedCustomerRow,
  CommunicationListItem,
  ContactRow,
  CustomerDetail,
  CustomerTableRow,
  DocumentRow,
  LookupOption,
  MentionRef,
  PagedResult,
  PurgedCustomerRow,
  QuoteRow,
} from '@/lib/data/types';

export const DEFAULT_PAGE_SIZE = 25;

/** The customer's primary address: the flagged default, else the oldest row. */
const DEFAULT_ADDRESS_SQL = (field: string): string =>
  `(SELECT a.${field} FROM customer_addresses a WHERE a.customer_id = cu.id ORDER BY a.is_default DESC, a.id ASC LIMIT 1)`;

const CUSTOMER_COLUMNS = `
         cu.id,
         cu.account_no,
         cu.name,
         cu.email,
         cu.phone,
         cu.customer_id_status_id AS status_id,
         cs.name   AS status_name,
         cs.colour AS status_colour,
         cu.industry_id,
         i.name AS industry_name,
         cu.assigned_to,
         assignee.name AS assigned_to_name,
         cu.assigned_group_id,
         ag.name AS assigned_group_name,
         cu.deleted_at,
         cu.deleted_by,
         ${DEFAULT_ADDRESS_SQL('id')}          AS address_id,
         ${DEFAULT_ADDRESS_SQL('address')}     AS address,
         ${DEFAULT_ADDRESS_SQL('address_line2')} AS address_line2,
         ${DEFAULT_ADDRESS_SQL('town')}        AS town,
         ${DEFAULT_ADDRESS_SQL('city')}        AS city,
         ${DEFAULT_ADDRESS_SQL('county')}      AS county,
         ${DEFAULT_ADDRESS_SQL('postcode')}    AS postcode,
         ${DEFAULT_ADDRESS_SQL('country')}     AS country`;

const CUSTOMER_JOINS = `
    FROM customers cu
    LEFT JOIN customer_id_statuses cs ON cs.id = cu.customer_id_status_id
    LEFT JOIN industries i ON i.id = cu.industry_id
    LEFT JOIN users assignee ON assignee.id = cu.assigned_to
    LEFT JOIN assignment_groups ag ON ag.id = cu.assigned_group_id`;

function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/** Active statuses, industries and assignees, with how many customers each holds. */
export async function getLookupOptions(): Promise<{
  statuses: LookupOption[];
  industries: LookupOption[];
  owners: LookupOption[];
}> {
  await verifySession();

  const statuses = await queryRows<LookupOption>(
    `SELECT cs.id, cs.name, cs.colour, COUNT(cu.id) AS customer_count
       FROM customer_id_statuses cs
       LEFT JOIN customers cu ON cu.customer_id_status_id = cs.id AND cu.deleted_at IS NULL
      WHERE cs.is_active = 1
      GROUP BY cs.id, cs.name, cs.colour, cs.sort_order
      ORDER BY cs.sort_order ASC, cs.name ASC`
  );

  const industries = await queryRows<LookupOption>(
    `SELECT i.id, i.name, NULL AS colour, COUNT(cu.id) AS customer_count
       FROM industries i
       LEFT JOIN customers cu ON cu.industry_id = i.id AND cu.deleted_at IS NULL
      WHERE i.is_active = 1
      GROUP BY i.id, i.name, i.sort_order
      ORDER BY i.sort_order ASC, i.name ASC`
  );

  /**
   * Who a customer can be assigned to: active groups first, then people. Inactive
   * groups (Vtiger's "Delete", "Archived Contacts", …) are hidden here, but the
   * editor still shows one when a customer already points at it. Archived
   * customers are not counted.
   */
  const owners = await queryRows<LookupOption>(
    `SELECT g.id, g.name, NULL AS colour, COUNT(cu.id) AS customer_count, 'group' AS kind
       FROM assignment_groups g
       LEFT JOIN customers cu ON cu.assigned_group_id = g.id AND cu.deleted_at IS NULL
      WHERE g.is_active = 1
      GROUP BY g.id, g.name, g.sort_order
      UNION ALL
     SELECT u.id, u.name, NULL AS colour, COUNT(cu.id) AS customer_count, 'user' AS kind
       FROM users u
       LEFT JOIN customers cu ON cu.assigned_to = u.id AND cu.deleted_at IS NULL
      GROUP BY u.id, u.name
      ORDER BY kind ASC, name ASC`
  );

  return { statuses, industries, owners };
}

const TEXT_FILTER_SQL: Record<string, string> = {
  name: 'cu.name',
  email: 'cu.email',
  phone: 'cu.phone',
};

const ADDRESS_FILTER_SQL: Record<string, string> = {
  address: 'a.address',
  address_line2: 'a.address_line2',
  town: 'a.town',
  city: 'a.city',
  county: 'a.county',
  postcode: 'a.postcode',
  country: 'a.country',
};

const NUMERIC_FILTER_SQL: Record<string, string> = {
  communications: '(SELECT COUNT(*) FROM communications c WHERE c.customer_id = cu.id)',
  vtiger: 'cu.vtiger_account_id',
};

const SORT_SQL: Record<string, string> = {
  name: 'cu.name',
  status: 'cs.sort_order',
  industry: 'i.name',
  assigned_to: '(COALESCE(assignee.name, ag.name))',
  address: DEFAULT_ADDRESS_SQL('address'),
  address_line2: DEFAULT_ADDRESS_SQL('address_line2'),
  town: DEFAULT_ADDRESS_SQL('town'),
  city: DEFAULT_ADDRESS_SQL('city'),
  county: DEFAULT_ADDRESS_SQL('county'),
  postcode: DEFAULT_ADDRESS_SQL('postcode'),
  country: DEFAULT_ADDRESS_SQL('country'),
  email: 'cu.email',
  phone: 'cu.phone',
  communications: NUMERIC_FILTER_SQL.communications,
  vtiger: 'cu.vtiger_account_id',
};

/**
 * Lookup columns match on ids; the literal `none` means "nothing set", which the
 * filter only offers where the column has an `emptyLabel`. `assigned_to` spans two
 * columns because a customer is owned by either a user or a group — safe to
 * collapse with COALESCE, since both sides hold UUIDs.
 */
const LOOKUP_FILTER_SQL: Record<string, string> = {
  status: 'cu.customer_id_status_id',
  industry: 'cu.industry_id',
  assigned_to: '(COALESCE(cu.assigned_to, cu.assigned_group_id))',
};

/** Translates the per-column filters into SQL. Values within one column are OR'd. */
function buildCustomerWhere(state: CustomerQueryState): { where: string; params: SqlParam[] } {
  // Archived customers are invisible to the table (and to its total) until an
  // administrator restores them from /customers/archived.
  const clauses: string[] = ['cu.deleted_at IS NULL'];
  const params: SqlParam[] = [];

  for (const [key, values] of Object.entries(state.filters)) {
    if (values.length === 0) continue;

    // Lookup columns match on ids; `none` (offered where an `emptyLabel` is set)
    // means the value is not set at all.
    const lookupSql = LOOKUP_FILTER_SQL[key];
    if (lookupSql) {
      const ids = values.filter((value) => value !== 'none');
      const parts: string[] = [];
      if (values.includes('none')) parts.push(`${lookupSql} IS NULL`);
      if (ids.length > 0) {
        parts.push(`${lookupSql} IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
      }
      clauses.push(`(${parts.join(' OR ')})`);
      continue;
    }

    const textSql = TEXT_FILTER_SQL[key];
    if (textSql) {
      clauses.push(`(${values.map(() => `${textSql} LIKE ?`).join(' OR ')})`);
      params.push(...values.map(likeTerm));
      continue;
    }

    const addressSql = ADDRESS_FILTER_SQL[key];
    if (addressSql) {
      const matches = values.map(() => `${addressSql} LIKE ?`).join(' OR ');
      clauses.push(
        `EXISTS (SELECT 1 FROM customer_addresses a WHERE a.customer_id = cu.id AND (${matches}))`
      );
      params.push(...values.map(likeTerm));
    }
  }

  for (const [key, range] of Object.entries(state.ranges)) {
    const numericSql = NUMERIC_FILTER_SQL[key];
    if (!numericSql) continue;
    if (range.min !== undefined) {
      clauses.push(`${numericSql} >= ?`);
      params.push(range.min);
    }
    if (range.max !== undefined) {
      clauses.push(`${numericSql} <= ?`);
      params.push(range.max);
    }
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** The flexible customer table query: multi-value filters, sorting and paging. */
export async function listCustomers(state: CustomerQueryState): Promise<PagedResult<CustomerTableRow>> {
  await verifySession();

  const { where, params } = buildCustomerWhere(state);

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM customers cu ${where}`,
    params
  );
  const total = Number(totalRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / state.size));
  const page = Math.min(Math.max(1, state.page), pageCount);

  const orderBy = SORT_SQL[state.sort] ?? SORT_SQL.name;
  const direction = state.dir === 'desc' ? 'DESC' : 'ASC';

  const rows = await queryRows<CustomerTableRow>(
    `SELECT cu.id,
            cu.name,
            cu.account_no,
            cu.email,
            cu.phone,
            cu.customer_id_status_id AS status_id,
            cs.name   AS status_name,
            cs.colour AS status_colour,
            cu.industry_id,
            i.name AS industry_name,
            cu.assigned_to,
            assignee.name AS assigned_to_name,
            cu.assigned_group_id,
            ag.name AS assigned_group_name,
            ${DEFAULT_ADDRESS_SQL('address')}     AS address,
            ${DEFAULT_ADDRESS_SQL('address_line2')} AS address_line2,
            ${DEFAULT_ADDRESS_SQL('town')}     AS town,
            ${DEFAULT_ADDRESS_SQL('city')}     AS city,
            ${DEFAULT_ADDRESS_SQL('county')}   AS county,
            ${DEFAULT_ADDRESS_SQL('postcode')} AS postcode,
            ${DEFAULT_ADDRESS_SQL('country')}  AS country,
            (SELECT COUNT(*) FROM communications c WHERE c.customer_id = cu.id) AS communications,
            cu.vtiger_account_id AS vtiger
     ${CUSTOMER_JOINS}
     ${where}
      ORDER BY ${orderBy} ${direction}, cu.name ASC
      LIMIT ? OFFSET ?`,
    [...params, state.size, (page - 1) * state.size]
  );

  return { rows, total, page, pageCount };
}

/** How each editable column is written, and what the audit trail calls the change. */
const EDITABLE_FIELDS: Record<
  string,
  { action: string; entityType: 'CUSTOMER' | 'ADDRESS'; sqlColumn: string; table: 'customers' | 'address' }
> = {
  name: { action: 'UPDATED', entityType: 'CUSTOMER', sqlColumn: 'name', table: 'customers' },
  email: { action: 'UPDATED', entityType: 'CUSTOMER', sqlColumn: 'email', table: 'customers' },
  phone: { action: 'UPDATED', entityType: 'CUSTOMER', sqlColumn: 'phone', table: 'customers' },
  status: { action: 'STATUS_CHANGED', entityType: 'CUSTOMER', sqlColumn: 'customer_id_status_id', table: 'customers' },
  industry: { action: 'INDUSTRY_CHANGED', entityType: 'CUSTOMER', sqlColumn: 'industry_id', table: 'customers' },
  // One cell, two columns: see the `owners` branch in updateCustomerField.
  assigned_to: { action: 'UPDATED', entityType: 'CUSTOMER', sqlColumn: 'assigned_to', table: 'customers' },
  address: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'address', table: 'address' },
  address_line2: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'address_line2', table: 'address' },
  town: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'town', table: 'address' },
  city: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'city', table: 'address' },
  county: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'county', table: 'address' },
  postcode: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'postcode', table: 'address' },
  country: { action: 'ADDRESS_CHANGED', entityType: 'ADDRESS', sqlColumn: 'country', table: 'address' },
};

/**
 * `edit.options` → the lookup table that owns those ids. `owners` is deliberately
 * absent: a customer's owner is one of two columns (`users` or
 * `assignment_groups`), so that column is handled separately.
 */
const LOOKUP_TABLES: Record<'statuses' | 'industries', string> = {
  statuses: 'customer_id_statuses',
  industries: 'industries',
};

/**
 * The lookup table behind a column's `options` key, or `null` for keys that have
 * none. The registry types `options` as a plain string so it stays entity-agnostic;
 * this guard narrows it back to the tables this service actually knows.
 */
function lookupTableFor(options: string | undefined): string | null {
  if (options === 'statuses' || options === 'industries') return LOOKUP_TABLES[options];
  return null;
}

/** What the Assigned to editor submits: `user:<uuid>`, `group:<uuid>` or ''. */
function parseOwnerValue(value: string): { kind: 'user' | 'group' | 'none'; id: string | null } | null {
  if (value === '') return { kind: 'none', id: null };
  if (value.startsWith('user:')) return { kind: 'user', id: value.slice('user:'.length) };
  if (value.startsWith('group:')) return { kind: 'group', id: value.slice('group:'.length) };
  return null;
}

/** Name behind a lookup id, so the audit trail reads "Loop" instead of a UUID. */
async function lookupLabel(
  connection: PoolConnection,
  table: string,
  id: string | null
): Promise<string | null> {
  if (!id) return null;
  const row = await queryOneOn<{ name: string }>(
    connection,
    `SELECT name FROM ${table} WHERE id = ? LIMIT 1`,
    [id]
  );
  return row?.name ?? id;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Editing is pointless while a customer is waiting for a decision on the Archived page. */
const ARCHIVED_ERROR =
  'This customer is archived — an administrator has to restore it before it can be edited.';

function isDuplicateEntry(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

/** Appends one row to the activity trail (same connection as the change itself). */
async function logCellChange(
  connection: PoolConnection,
  change: {
    customerId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    fieldName: string;
    previous: string | null;
    next: string | null;
  }
): Promise<void> {
  await runOn(
    connection,
    `INSERT INTO customer_activity
       (id, customer_id, action, entity_type, entity_id, field_name, old_value, new_value, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      change.customerId,
      change.action,
      change.entityType,
      change.entityId,
      change.fieldName,
      change.previous,
      change.next,
      change.actorId,
    ]
  );
}

/** Appends one description-only row to the activity trail (a comment has no field). */
async function logActivity(
  connection: PoolConnection,
  entry: {
    customerId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string;
  }
): Promise<void> {
  await runOn(
    connection,
    `INSERT INTO customer_activity
       (id, customer_id, action, entity_type, entity_id, description, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      entry.customerId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.description,
      entry.actorId,
    ]
  );
}

/**
 * Reads one submitted tag. The encoding matches the owner picklist — `user:<uuid>` or
 * `contact:<uuid>` — so both kinds travel through a single form field.
 */
function parseMentionValue(value: string): { kind: 'user' | 'contact'; id: string } | null {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;

  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1).trim();
  if (id === '') return null;
  if (kind === 'user' || kind === 'contact') return { kind, id };
  return null;
}

/**
 * Writes one edited table cell: validates the value against the column registry,
 * updates whichever table owns the column (`customers`, or the customer's default
 * address for town/county/postcode) and records the change in `customer_activity`
 * — all in one transaction. Edited addresses are stamped `source = 'MANUAL'`, so a
 * re-run of the Vtiger backfill (which replaces only `source = 'VTIGER'` rows)
 * cannot overwrite them.
 *
 * Errors are returned rather than thrown, so the cell can show them in place; the
 * stored value (or NULL when the cell was cleared) comes back on success.
 */
export async function updateCustomerField(input: {
  customerId: string;
  column: string;
  value: string;
}): Promise<CellUpdateResult> {
  const actor = await verifySession();

  const column = editableColumn(input.column);
  const field = EDITABLE_FIELDS[input.column];
  if (!column || !field) return { ok: false, error: 'That column cannot be edited.' };

  const { edit, label } = column;
  const submitted = input.value.trim();

  if (edit.required && submitted === '') {
    return { ok: false, error: `${label} cannot be empty.` };
  }
  if (edit.maxLength !== undefined && submitted.length > edit.maxLength) {
    return { ok: false, error: `${label} is limited to ${edit.maxLength} characters.` };
  }

  const next = submitted === '' ? null : submitted;

  if (next !== null && edit.kind === 'email' && !EMAIL_PATTERN.test(next)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  // --- Assigned to: one cell, two possible columns ---------------------------
  if (edit.options === 'owners') {
    const owner = parseOwnerValue(submitted);
    if (!owner) {
      return { ok: false, error: 'That assignment could not be read — reload the page and try again.' };
    }

    const ownerTable = owner.kind === 'group' ? 'assignment_groups' : 'users';
    let ownerName: string | null = null;
    if (owner.id) {
      const option = await queryOne<{ id: string; name: string }>(
        `SELECT id, name FROM ${ownerTable} WHERE id = ? LIMIT 1`,
        [owner.id]
      );
      if (!option) {
        return { ok: false, error: 'That assignee no longer exists — reload the page and try again.' };
      }
      ownerName = option.name;
    }

    try {
      return await withTransaction(async (connection) => {
        const current = await queryOneOn<{
          assigned_to: string | null;
          assigned_group_id: string | null;
          deleted_at: Date | null;
        }>(
          connection,
          'SELECT assigned_to, assigned_group_id, deleted_at FROM customers WHERE id = ? LIMIT 1 FOR UPDATE',
          [input.customerId]
        );

        if (!current) return { ok: false, error: 'That customer no longer exists.' };
        if (current.deleted_at) return { ok: false, error: ARCHIVED_ERROR };

        const nextUserId = owner.kind === 'user' ? owner.id : null;
        const nextGroupId = owner.kind === 'group' ? owner.id : null;

        if (current.assigned_to === nextUserId && current.assigned_group_id === nextGroupId) {
          return { ok: true, value: submitted };
        }

        // Exactly one owner: setting one column clears the other.
        await runOn(
          connection,
          'UPDATE customers SET assigned_to = ?, assigned_group_id = ? WHERE id = ?',
          [nextUserId, nextGroupId, input.customerId]
        );

        const trail = {
          customerId: input.customerId,
          actorId: actor.id,
          action: field.action,
          entityType: field.entityType,
          entityId: input.customerId,
        };

        if (current.assigned_to !== nextUserId) {
          await logCellChange(connection, {
            ...trail,
            fieldName: 'assigned_to',
            previous: await lookupLabel(connection, 'users', current.assigned_to),
            next: owner.kind === 'user' ? ownerName : null,
          });
        }
        if (current.assigned_group_id !== nextGroupId) {
          await logCellChange(connection, {
            ...trail,
            fieldName: 'assigned_group',
            previous: await lookupLabel(connection, 'assignment_groups', current.assigned_group_id),
            next: owner.kind === 'group' ? ownerName : null,
          });
        }

        return { ok: true, value: submitted };
      });
    } catch (error) {
      console.error('[customers] owner update failed', error);
      return { ok: false, error: 'Could not save that change. Please try again.' };
    }
  }

  // Picklist ids arrive from the browser, so confirm they still exist before binding them.
  let nextLabel: string | null = next;
  const lookupTable = lookupTableFor(edit.options);
  if (next !== null && lookupTable) {
    const option = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM ${lookupTable} WHERE id = ? LIMIT 1`,
      [next]
    );
    if (!option) {
      return { ok: false, error: 'That option no longer exists — reload the page and try again.' };
    }
    nextLabel = option.name;
  }

  const onCustomer = field.table === 'customers';

  try {
    return await withTransaction(async (connection) => {
      // The very row the table reads: default address, else the oldest one.
      const current = await queryOneOn<{ id: string; current: string | null; deleted_at: Date | null }>(
        connection,
        onCustomer
          ? `SELECT id, ${field.sqlColumn} AS current, deleted_at
               FROM customers
              WHERE id = ?
              LIMIT 1
              FOR UPDATE`
          : `SELECT id, ${field.sqlColumn} AS current,
                    (SELECT cu.deleted_at FROM customers cu WHERE cu.id = customer_addresses.customer_id) AS deleted_at
               FROM customer_addresses
              WHERE customer_id = ?
              ORDER BY is_default DESC, id ASC
              LIMIT 1
              FOR UPDATE`,
        [input.customerId]
      );

      if (!current) {
        return onCustomer
          ? { ok: false, error: 'That customer no longer exists.' }
          : {
              ok: false,
              error: 'This customer has no address yet — add one on the customer page first.',
            };
      }

      if (current.deleted_at) return { ok: false, error: ARCHIVED_ERROR };

      // Nothing changed: leave the row and the audit trail alone.
      if (current.current === next) return { ok: true, value: next };

      await runOn(
        connection,
        onCustomer
          ? `UPDATE customers SET ${field.sqlColumn} = ? WHERE id = ?`
          : `UPDATE customer_addresses SET ${field.sqlColumn} = ?, source = 'MANUAL' WHERE id = ?`,
        [next, onCustomer ? input.customerId : current.id]
      );

      // A lookup id is meaningless in the trail, so record what it stands for.
      const previousLabel = lookupTable
        ? await lookupLabel(connection, lookupTable, current.current)
        : current.current;

      await logCellChange(connection, {
        customerId: input.customerId,
        actorId: actor.id,
        action: field.action,
        entityType: field.entityType,
        entityId: onCustomer ? input.customerId : current.id,
        fieldName: input.column,
        previous: previousLabel,
        next: nextLabel,
      });

      return { ok: true, value: next };
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: `${label} is already used by another customer.` };
    }

    console.error('[customers] cell update failed', error);
    return { ok: false, error: 'Could not save that change. Please try again.' };
  }
}

/** Restoring and permanently deleting are administrator-only. */
const ADMIN_ONLY_ERROR = 'Only administrators can do that.';

/** Bulk operations are capped so one request can never try to wipe the whole book. */
const MAX_BATCH = 500;

const placeholders = (ids: string[]) => ids.map(() => '?').join(', ');

/** The child rows a permanent delete takes with it (every one cascades). */
const CHILD_COUNT_SQL = (customerRef: string) => `
         (SELECT COUNT(*) FROM contacts c WHERE c.customer_id = ${customerRef})           AS contacts,
         (SELECT COUNT(*) FROM communications co WHERE co.customer_id = ${customerRef})   AS communications,
         (SELECT COUNT(*) FROM customer_addresses a WHERE a.customer_id = ${customerRef}) AS addresses,
         (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = ${customerRef})             AS quotes,
         (SELECT COUNT(*) FROM documents d WHERE d.customer_id = ${customerRef})          AS documents`;

type CountedCustomer = {
  id: string;
  name: string;
  account_no: string | null;
  vtiger_account_id: number | null;
  contacts: number;
  communications: number;
  addresses: number;
  quotes: number;
  documents: number;
};

type DeletionStage = 'ARCHIVED' | 'RESTORED' | 'PURGED';

/** Shape and size check shared by archive, restore and purge. */
function normalizeIds(ids: string[]): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(ids)) return { ok: false, error: 'Select at least one customer.' };

  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim() !== '')));
  if (unique.length === 0) return { ok: false, error: 'Select at least one customer.' };
  if (unique.length > MAX_BATCH) {
    return { ok: false, error: `That is more than ${MAX_BATCH} customers at once — please narrow the selection.` };
  }

  return { ok: true, ids: unique };
}

/**
 * Records one stage of a customer's removal. `customer_deletion_log` has no foreign
 * keys, so the row outlives the customer it describes and the user who did it — and
 * for a permanent delete it keeps the child counts that were destroyed.
 */
async function logDeletion(
  connection: PoolConnection,
  rows: CountedCustomer[],
  stage: DeletionStage,
  actor: AuthUser
): Promise<void> {
  for (const row of rows) {
    await runOn(
      connection,
      `INSERT INTO customer_deletion_log
         (id, customer_id, action, name, account_no, vtiger_account_id,
          contacts, communications, addresses, quotes, documents, actor_id, actor_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        row.id,
        stage,
        row.name,
        row.account_no,
        row.vtiger_account_id,
        row.contacts,
        row.communications,
        row.addresses,
        row.quotes,
        row.documents,
        actor.id,
        actor.name,
      ]
    );
  }
}

/**
 * Soft delete. Any signed-in user may archive: the customer disappears from the
 * table, the dashboard, the lookups and its own page, but nothing is destroyed and
 * an administrator can bring it back from /customers/archived.
 */
export async function archiveCustomers(
  ids: string[]
): Promise<{ ok: true; archived: number } | { ok: false; error: string }> {
  const actor = await verifySession();
  const target = normalizeIds(ids);
  if (!target.ok) return target;

  try {
    return await withTransaction(async (connection) => {
      const rows = await queryRowsOn<CountedCustomer>(
        connection,
        `SELECT cu.id, cu.name, cu.account_no, cu.vtiger_account_id, ${CHILD_COUNT_SQL('cu.id')}
           FROM customers cu
          WHERE cu.id IN (${placeholders(target.ids)})
            AND cu.deleted_at IS NULL
          FOR UPDATE`,
        target.ids
      );

      if (rows.length === 0) return { ok: true, archived: 0 };

      const archived = rows.map((row) => row.id);
      await runOn(
        connection,
        `UPDATE customers SET deleted_at = NOW(), deleted_by = ? WHERE id IN (${placeholders(archived)})`,
        [actor.id, ...archived]
      );
      await logDeletion(connection, rows, 'ARCHIVED', actor);

      return { ok: true, archived: rows.length };
    });
  } catch (error) {
    console.error('[customers] archive failed', error);
    return { ok: false, error: 'Could not archive those customers. Please try again.' };
  }
}

/** Brings archived customers back into every view. Administrators only. */
export async function restoreCustomers(
  ids: string[]
): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };

  const target = normalizeIds(ids);
  if (!target.ok) return target;

  try {
    return await withTransaction(async (connection) => {
      const rows = await queryRowsOn<CountedCustomer>(
        connection,
        `SELECT cu.id, cu.name, cu.account_no, cu.vtiger_account_id, ${CHILD_COUNT_SQL('cu.id')}
           FROM customers cu
          WHERE cu.id IN (${placeholders(target.ids)})
            AND cu.deleted_at IS NOT NULL
          FOR UPDATE`,
        target.ids
      );

      if (rows.length === 0) return { ok: true, restored: 0 };

      const restored = rows.map((row) => row.id);
      await runOn(
        connection,
        `UPDATE customers SET deleted_at = NULL, deleted_by = NULL WHERE id IN (${placeholders(restored)})`,
        restored
      );
      await logDeletion(connection, rows, 'RESTORED', actor);

      return { ok: true, restored: rows.length };
    });
  } catch (error) {
    console.error('[customers] restore failed', error);
    return { ok: false, error: 'Could not restore those customers. Please try again.' };
  }
}

/**
 * The irreversible step: write down what is about to vanish, then delete the
 * customer — which cascades into contacts, addresses, quotes, documents,
 * communications and the activity trail. Only rows that are already archived can
 * ever be purged, so even a crafted request cannot remove a live customer.
 */
export async function purgeCustomers(
  ids: string[]
): Promise<{ ok: true; purged: number } | { ok: false; error: string }> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };

  const target = normalizeIds(ids);
  if (!target.ok) return target;

  try {
    return await withTransaction(async (connection) => {
      const rows = await queryRowsOn<CountedCustomer>(
        connection,
        `SELECT cu.id, cu.name, cu.account_no, cu.vtiger_account_id, ${CHILD_COUNT_SQL('cu.id')}
           FROM customers cu
          WHERE cu.id IN (${placeholders(target.ids)})
            AND cu.deleted_at IS NOT NULL
          FOR UPDATE`,
        target.ids
      );

      if (rows.length === 0) return { ok: true, purged: 0 };

      const doomed = rows.map((row) => row.id);
      await logDeletion(connection, rows, 'PURGED', actor);
      await runOn(
        connection,
        `DELETE FROM customers WHERE id IN (${placeholders(doomed)}) AND deleted_at IS NOT NULL`,
        doomed
      );

      return { ok: true, purged: doomed.length };
    });
  } catch (error) {
    console.error('[customers] purge failed', error);
    return { ok: false, error: 'Could not delete those customers. Please try again.' };
  }
}

/** The review screen: archived customers plus exactly what a purge would destroy. */
export async function listArchivedCustomers(
  options: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<ArchivedCustomerRow>> {
  await verifySession();

  const pageSize = options.pageSize ?? 25;
  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM customers WHERE deleted_at IS NOT NULL'
  );
  const total = Number(totalRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const rows = await queryRows<ArchivedCustomerRow>(
    `SELECT cu.id, cu.name, cu.account_no, cu.deleted_at,
            deleter.name AS deleted_by_name,
            ${CHILD_COUNT_SQL('cu.id')}
       FROM customers cu
       LEFT JOIN users deleter ON deleter.id = cu.deleted_by
      WHERE cu.deleted_at IS NOT NULL
      ORDER BY cu.deleted_at DESC, cu.name ASC
      LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize]
  );

  return { rows, total, page, pageCount };
}

/** Permanent deletions on record — the customer itself is long gone. */
export async function listPurgedCustomers(limit = 10): Promise<PurgedCustomerRow[]> {
  await verifySession();

  return queryRows<PurgedCustomerRow>(
    `SELECT id, name, account_no, actor_name, created_at,
            contacts, communications, addresses, quotes, documents
       FROM customer_deletion_log
      WHERE action = 'PURGED'
      ORDER BY created_at DESC
      LIMIT ?`,
    [limit]
  );
}

/** Everything the create/edit form submits, reduced to trimmed strings by the action. */
export type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  statusId: string;
  industryId: string;
  /** `user:<uuid>` / `group:<uuid>` / `''` — the same encoding the inline editor uses. */
  owner: string;
  address: string;
  address_line2: string;
  town: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
};

export type CustomerWriteResult = { ok: true; id: string } | { ok: false; error: string; field?: string };

/** Lengths mirror the columns; the form mirrors them as `maxLength`. */
const CUSTOMER_FIELD_LIMITS: Record<string, number> = {
  name: 255,
  email: 255,
  phone: 50,
  address: 255,
  address_line2: 255,
  town: 100,
  city: 100,
  county: 100,
  postcode: 20,
  country: 100,
};

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

type NormalisedCustomer = {
  name: string;
  email: string | null;
  phone: string | null;
  statusId: string | null;
  industryId: string | null;
  assignedTo: string | null;
  assignedGroupId: string | null;
  address: string | null;
  address_line2: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  /** True when the form carried any address value at all. */
  hasAddress: boolean;
};

/** Validates one submitted field: required, length, and the email shape. */
function validateField(key: string, label: string, value: string, required = false): string | null {
  const trimmed = value.trim();
  if (required && trimmed === '') return `${label} cannot be empty.`;
  const limit = CUSTOMER_FIELD_LIMITS[key];
  if (limit !== undefined && trimmed.length > limit) return `${label} is limited to ${limit} characters.`;
  if (key === 'email' && trimmed !== '' && !EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  return null;
}

/** Shape checks plus the existence checks for the picklists. */
async function validateCustomerInput(
  input: CustomerInput
): Promise<{ ok: true; value: NormalisedCustomer } | { ok: false; error: string; field?: string }> {
  const checks: { key: string; label: string; required?: boolean }[] = [
    { key: 'name', label: 'Account', required: true },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address line' },
    { key: 'address_line2', label: 'Address line 2' },
    { key: 'town', label: 'Town' },
    { key: 'city', label: 'City' },
    { key: 'county', label: 'County' },
    { key: 'postcode', label: 'Postcode' },
    { key: 'country', label: 'Country' },
  ];

  for (const check of checks) {
    const error = validateField(check.key, check.label, input[check.key as keyof CustomerInput], check.required);
    if (error) return { ok: false, error, field: check.key };
  }

  const hasAddress = [
    input.address,
    input.address_line2,
    input.town,
    input.city,
    input.county,
    input.postcode,
    input.country,
  ].some((value) => value.trim() !== '');

  // customer_addresses.address is NOT NULL, so a partly filled address needs its street.
  if (hasAddress && input.address.trim() === '') {
    return {
      ok: false,
      error: 'Address line is required when you enter any other part of the address.',
      field: 'address',
    };
  }

  for (const [field, table, id] of [
    ['status', 'customer_id_statuses', input.statusId],
    ['industry', 'industries', input.industryId],
  ] as const) {
    if (id.trim() === '') continue;
    const option = await queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    if (!option) return { ok: false, error: 'That option no longer exists — reload the page and try again.', field };
  }

  const owner = parseOwnerValue(input.owner.trim());
  if (!owner) {
    return { ok: false, error: 'That assignment could not be read — reload the page and try again.', field: 'assigned_to' };
  }
  if (owner.id) {
    const table = owner.kind === 'group' ? 'assignment_groups' : 'users';
    const option = await queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [owner.id]);
    if (!option) {
      return { ok: false, error: 'That assignee no longer exists — reload the page and try again.', field: 'assigned_to' };
    }
  }

  return {
    ok: true,
    value: {
      name: input.name.trim(),
      email: blankToNull(input.email),
      phone: blankToNull(input.phone),
      statusId: blankToNull(input.statusId),
      industryId: blankToNull(input.industryId),
      assignedTo: owner.kind === 'user' ? owner.id : null,
      assignedGroupId: owner.kind === 'group' ? owner.id : null,
      address: blankToNull(input.address),
      address_line2: blankToNull(input.address_line2),
      town: blankToNull(input.town),
      city: blankToNull(input.city),
      county: blankToNull(input.county),
      postcode: blankToNull(input.postcode),
      country: blankToNull(input.country),
      hasAddress,
    },
  };
}

/** The next free account number, following the legacy convention ('015071' → '015072'). */
export async function nextAccountNumber(): Promise<string> {
  const row = await queryOne<{ max: number | null }>(
    'SELECT MAX(CAST(account_no AS UNSIGNED)) AS max FROM customers'
  );
  return String(Number(row?.max ?? 0) + 1).padStart(6, '0');
}

/**
 * Creates a customer. Account numbers are internal bookkeeping, so the next one is
 * generated here instead of being asked for; the address block becomes the
 * customer's first (default) address and the creation is recorded in the trail.
 */
export async function createCustomer(input: CustomerInput): Promise<CustomerWriteResult> {
  const actor = await verifySession();
  const validated = await validateCustomerInput(input);
  if (!validated.ok) return validated;
  const value = validated.value;

  // Allocated before the transaction: a clash (two creates at the same moment) is
  // caught by the unique index and reported below.
  const accountNo = await nextAccountNumber();

  try {
    const id = await withTransaction(async (connection) => {
      const customerId = uuidv4();
      await runOn(
        connection,
        `INSERT INTO customers
           (id, account_no, name, email, phone, customer_id_status_id, industry_id, assigned_to, assigned_group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          accountNo,
          value.name,
          value.email,
          value.phone,
          value.statusId,
          value.industryId,
          value.assignedTo,
          value.assignedGroupId,
        ]
      );

      if (value.hasAddress) {
        await runOn(
          connection,
          `INSERT INTO customer_addresses
             (id, customer_id, address_type, address, address_line2, town, city, county, postcode, country, is_default, source)
           VALUES (?, ?, 'BILLING', ?, ?, ?, ?, ?, ?, ?, 1, 'MANUAL')`,
          [
            uuidv4(),
            customerId,
            value.address,
            value.address_line2,
            value.town,
            value.city,
            value.county,
            value.postcode,
            value.country,
          ]
        );
      }

      await runOn(
        connection,
        `INSERT INTO customer_activity (id, customer_id, action, entity_type, entity_id, description, actor_id)
         VALUES (?, ?, 'CREATED', 'CUSTOMER', ?, ?, ?)`,
        [uuidv4(), customerId, customerId, `Customer created by ${actor.name}`, actor.id]
      );

      return customerId;
    });

    return { ok: true, id };
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: 'Could not allocate the next account number — please try again.' };
    }
    console.error('[customers] create failed', error);
    return { ok: false, error: 'Could not create the customer. Please try again.' };
  }
}

type AddressFields = {
  address: string | null;
  address_line2: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
};

const ADDRESS_FIELDS = ['address', 'address_line2', 'town', 'city', 'county', 'postcode', 'country'] as const;

/**
 * Writes the customer's primary address. The row is created the first time any
 * address value is entered; afterwards only the changed fields are updated, with
 * `source` flipped to MANUAL so the Vtiger backfill leaves it alone. Every change is
 * logged, so the activity trail reads the same as for an inline edit.
 */
async function applyAddressChanges(
  connection: PoolConnection,
  args: {
    customerId: string;
    actorId: string;
    addressId: string | null;
    current: AddressFields;
    next: AddressFields;
  }
): Promise<void> {
  const changes = ADDRESS_FIELDS.map((field) => ({
    field,
    column: field,
    previous: args.current[field],
    next: args.next[field],
  })).filter((change) => change.previous !== change.next);

  const logAddress = async (
    entityId: string,
    change: { field: string; previous: string | null; next: string | null }
  ) => {
    await logCellChange(connection, {
      customerId: args.customerId,
      actorId: args.actorId,
      action: 'ADDRESS_CHANGED',
      entityType: 'ADDRESS',
      entityId,
      fieldName: change.field,
      previous: change.previous,
      next: change.next,
    });
  };

  if (!args.addressId) {
    // Nothing but blanks: the customer simply has no address yet.
    if (!ADDRESS_FIELDS.some((field) => args.next[field] !== null)) return;

    const addressId = uuidv4();
    await runOn(
      connection,
      `INSERT INTO customer_addresses
         (id, customer_id, address_type, address, address_line2, town, city, county, postcode, country, is_default, source)
       VALUES (?, ?, 'BILLING', ?, ?, ?, ?, ?, ?, ?, 1, 'MANUAL')`,
      [
        addressId,
        args.customerId,
        args.next.address,
        args.next.address_line2,
        args.next.town,
        args.next.city,
        args.next.county,
        args.next.postcode,
        args.next.country,
      ]
    );

    for (const change of changes) {
      if (change.next !== null) await logAddress(addressId, change);
    }
    return;
  }

  if (changes.length === 0) return;

  await runOn(
    connection,
    `UPDATE customer_addresses
        SET ${changes.map((change) => `\`${change.column}\` = ?`).join(', ')}, source = 'MANUAL'
      WHERE id = ?`,
    [...changes.map((change) => change.next), args.addressId]
  );

  for (const change of changes) await logAddress(args.addressId, change);
}

type CurrentCustomerRow = {
  deleted_at: Date | null;
  name: string;
  email: string | null;
  phone: string | null;
  status_id: string | null;
  industry_id: string | null;
  assigned_to: string | null;
  assigned_group_id: string | null;
  address_id: string | null;
  address: string | null;
  address_line2: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
};

/**
 * Updates a customer and its primary address. Only changed values are written, and
 * every change lands in the activity trail — one row per field, named exactly the
 * way the inline editors name them, with lookup ids resolved to their labels.
 */
export async function updateCustomer(id: string, input: CustomerInput): Promise<CustomerWriteResult> {
  const actor = await verifySession();
  const validated = await validateCustomerInput(input);
  if (!validated.ok) return validated;
  const value = validated.value;

  try {
    return await withTransaction(async (connection) => {
      const current = await queryOneOn<CurrentCustomerRow>(
        connection,
        `SELECT cu.deleted_at, cu.name, cu.email, cu.phone,
                cu.customer_id_status_id AS status_id, cu.industry_id,
                cu.assigned_to, cu.assigned_group_id,
                ${DEFAULT_ADDRESS_SQL('id')}            AS address_id,
                ${DEFAULT_ADDRESS_SQL('address')}       AS address,
                ${DEFAULT_ADDRESS_SQL('address_line2')} AS address_line2,
                ${DEFAULT_ADDRESS_SQL('town')}          AS town,
                ${DEFAULT_ADDRESS_SQL('city')}          AS city,
                ${DEFAULT_ADDRESS_SQL('county')}        AS county,
                ${DEFAULT_ADDRESS_SQL('postcode')}      AS postcode,
                ${DEFAULT_ADDRESS_SQL('country')}       AS country
           FROM customers cu
          WHERE cu.id = ?
          LIMIT 1
          FOR UPDATE`,
        [id]
      );

      if (!current) return { ok: false as const, error: 'That customer no longer exists.' };
      if (current.deleted_at) return { ok: false as const, error: ARCHIVED_ERROR };

      // An existing address row keeps its street: the column is NOT NULL.
      if (current.address_id && value.address === null) {
        return { ok: false as const, error: 'Address line cannot be empty.', field: 'address' };
      }

      const customerChanges = [
        { field: 'name', column: 'name', previous: current.name, next: value.name, action: 'UPDATED', lookup: null },
        { field: 'email', column: 'email', previous: current.email, next: value.email, action: 'UPDATED', lookup: null },
        { field: 'phone', column: 'phone', previous: current.phone, next: value.phone, action: 'UPDATED', lookup: null },
        {
          field: 'status',
          column: 'customer_id_status_id',
          previous: current.status_id,
          next: value.statusId,
          action: 'STATUS_CHANGED',
          lookup: 'customer_id_statuses',
        },
        {
          field: 'industry',
          column: 'industry_id',
          previous: current.industry_id,
          next: value.industryId,
          action: 'INDUSTRY_CHANGED',
          lookup: 'industries',
        },
        {
          field: 'assigned_to',
          column: 'assigned_to',
          previous: current.assigned_to,
          next: value.assignedTo,
          action: 'UPDATED',
          lookup: 'users',
        },
        {
          field: 'assigned_group',
          column: 'assigned_group_id',
          previous: current.assigned_group_id,
          next: value.assignedGroupId,
          action: 'UPDATED',
          lookup: 'assignment_groups',
        },
      ].filter((change) => change.previous !== change.next);

      if (customerChanges.length > 0) {
        await runOn(
          connection,
          `UPDATE customers SET ${customerChanges.map((change) => `\`${change.column}\` = ?`).join(', ')} WHERE id = ?`,
          [...customerChanges.map((change) => change.next), id]
        );

        for (const change of customerChanges) {
          await logCellChange(connection, {
            customerId: id,
            actorId: actor.id,
            action: change.action,
            entityType: 'CUSTOMER',
            entityId: id,
            fieldName: change.field,
            previous: change.lookup
              ? await lookupLabel(connection, change.lookup, change.previous)
              : change.previous,
            next: change.lookup ? await lookupLabel(connection, change.lookup, change.next) : change.next,
          });
        }
      }

      await applyAddressChanges(connection, {
        customerId: id,
        actorId: actor.id,
        addressId: current.address_id,
        current: {
          address: current.address,
          address_line2: current.address_line2,
          town: current.town,
          city: current.city,
          county: current.county,
          postcode: current.postcode,
          country: current.country,
        },
        next: {
          address: value.address,
          address_line2: value.address_line2,
          town: value.town,
          city: value.city,
          county: value.county,
          postcode: value.postcode,
          country: value.country,
        },
      });

      return { ok: true as const, id };
    });
  } catch (error) {
    console.error('[customers] update failed', error);
    return { ok: false, error: 'Could not save the customer. Please try again.' };
  }
}

/** Badge counts for the customer tabs (cheap COUNTs on customer_id). */
export async function getCustomerTabCounts(
  customerId: string
): Promise<{ contacts: number; quotes: number; updates: number; comments: number; documents: number }> {
  await verifySession();

  const row = await queryOne<{
    contacts: number;
    quotes: number;
    updates: number;
    comments: number;
    documents: number;
  }>(
    `SELECT (SELECT COUNT(*) FROM contacts t WHERE t.customer_id = ?) AS contacts,
            (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = ?) AS quotes,
            (SELECT COUNT(*) FROM customer_activity ca WHERE ca.customer_id = ?) AS updates,
            (SELECT COUNT(*) FROM communications c WHERE c.customer_id = ?) AS comments,
            (SELECT COUNT(*) FROM documents d WHERE d.customer_id = ?) AS documents`,
    [customerId, customerId, customerId, customerId, customerId]
  );

  return {
    contacts: Number(row?.contacts ?? 0),
    quotes: Number(row?.quotes ?? 0),
    updates: Number(row?.updates ?? 0),
    comments: Number(row?.comments ?? 0),
    documents: Number(row?.documents ?? 0),
  };
}

/** Longest comment we accept (the column is TEXT, so this is a sanity bound). */
export const COMMENT_MAX_LENGTH = 4000;

/** How many people one comment may tag. */
export const COMMENT_MAX_MENTIONS = 20;

export type CustomerCommentInput = {
  customerId: string;
  content: string;
  /** Encoded tags — `contact:<uuid>` (a contact of the customer) or `user:<uuid>`. */
  mentions: string[];
};

export type CustomerCommentResult = { ok: true; id: string } | { ok: false; error: string; field?: string };

/**
 * Adds one comment to a customer's timeline, tagging the contacts and colleagues it
 * mentions.
 *
 * The comment, its tags and the activity-trail row are written in one transaction, so
 * a half-saved comment is impossible. Every tag is re-checked server-side: a contact
 * has to belong to this customer and a tagged colleague has to exist, otherwise the
 * whole submit is rejected.
 */
export async function addCustomerComment(input: CustomerCommentInput): Promise<CustomerCommentResult> {
  const actor = await verifySession();

  const content = input.content.trim();
  if (content === '') return { ok: false, error: 'Comment cannot be empty.', field: 'content' };
  if (content.length > COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `Comment is limited to ${COMMENT_MAX_LENGTH} characters.`,
      field: 'content',
    };
  }

  // De-duplicate the submitted values, then parse: one tag per target.
  const targets = new Map<string, { kind: 'user' | 'contact'; id: string }>();
  for (const raw of new Set(input.mentions)) {
    const parsed = parseMentionValue(raw);
    if (!parsed) {
      return {
        ok: false,
        error: 'That tag could not be read — reload the page and try again.',
        field: 'mentions',
      };
    }
    targets.set(`${parsed.kind}:${parsed.id}`, parsed);
  }
  if (targets.size > COMMENT_MAX_MENTIONS) {
    return { ok: false, error: `You can tag up to ${COMMENT_MAX_MENTIONS} people at once.`, field: 'mentions' };
  }

  const contactIds = [...targets.values()].filter((target) => target.kind === 'contact').map((t) => t.id);
  const userIds = [...targets.values()].filter((target) => target.kind === 'user').map((t) => t.id);

  try {
    return await withTransaction(async (connection) => {
      const customer = await queryOneOn<{ id: string; deleted_at: Date | null }>(
        connection,
        'SELECT id, deleted_at FROM customers WHERE id = ? LIMIT 1 FOR UPDATE',
        [input.customerId]
      );
      if (!customer) return { ok: false as const, error: 'That customer no longer exists.' };
      if (customer.deleted_at) return { ok: false as const, error: ARCHIVED_ERROR };

      /** `kind:id` -> display name, for the audit description. */
      const names = new Map<string, string>();

      if (contactIds.length > 0) {
        const contacts = await queryRowsOn<{ id: string; name: string }>(
          connection,
          `SELECT id, CONCAT_WS(' ', first_name, last_name) AS name
             FROM contacts
            WHERE customer_id = ? AND id IN (${contactIds.map(() => '?').join(', ')})`,
          [input.customerId, ...contactIds]
        );
        if (contacts.length !== contactIds.length) {
          return {
            ok: false as const,
            error: 'That contact is not on this customer — reload the page and try again.',
            field: 'mentions',
          };
        }
        for (const contact of contacts) names.set(`contact:${contact.id}`, contact.name);
      }

      if (userIds.length > 0) {
        const people = await queryRowsOn<{ id: string; name: string }>(
          connection,
          `SELECT id, name FROM users WHERE id IN (${userIds.map(() => '?').join(', ')})`,
          userIds
        );
        if (people.length !== userIds.length) {
          return {
            ok: false as const,
            error: 'That person no longer exists — reload the page and try again.',
            field: 'mentions',
          };
        }
        for (const person of people) names.set(`user:${person.id}`, person.name);
      }

      const commentId = uuidv4();
      await runOn(
        connection,
        `INSERT INTO communications (id, customer_id, author_id, content, communication_type, created_at)
         VALUES (?, ?, ?, ?, 'COMMENT', NOW())`,
        [commentId, input.customerId, actor.id, content]
      );

      for (const target of targets.values()) {
        await runOn(
          connection,
          `INSERT INTO communication_mentions (id, communication_id, contact_id, user_id)
           VALUES (?, ?, ?, ?)`,
          [
            uuidv4(),
            commentId,
            target.kind === 'contact' ? target.id : null,
            target.kind === 'user' ? target.id : null,
          ]
        );
      }

      const tagged = [...targets.values()].map((target) => {
        const name = names.get(`${target.kind}:${target.id}`) ?? 'Unknown';
        return target.kind === 'contact' ? `${name} (contact)` : name;
      });

      await logActivity(connection, {
        customerId: input.customerId,
        actorId: actor.id,
        action: 'COMMENT_ADDED',
        entityType: 'COMMENT',
        entityId: commentId,
        description: tagged.length > 0 ? `Comment added · tagged ${tagged.join(', ')}` : 'Comment added',
      });

      return { ok: true as const, id: commentId };
    });
  } catch (error) {
    console.error('[customers] comment failed', error);
    return { ok: false, error: 'Could not add the comment. Please try again.' };
  }
}

/** A one-line, length-capped excerpt of a comment, for the activity trail. */
function commentSnippet(content: string, limit = 80): string {
  const flattened = content.replace(/\s+/g, ' ').trim();
  return flattened.length > limit ? `${flattened.slice(0, limit - 1)}…` : flattened;
}

/**
 * Deletes one comment.
 *
 * Only its author can: the check runs against the locked row, so a forged id can
 * never touch somebody else's note. The comment's tags go with it (the foreign key
 * cascades) and the trail keeps a snippet of what was removed, plus who it had
 * tagged, so the Updates tab still shows that a note existed.
 */
export async function deleteCustomerComment(
  commentId: string
): Promise<{ ok: true; id: string; customerId: string } | { ok: false; error: string }> {
  const actor = await verifySession();
  if (!commentId) return { ok: false, error: 'Missing comment.' };

  try {
    return await withTransaction(async (connection) => {
      const comment = await queryOneOn<{
        id: string;
        customer_id: string;
        author_id: string | null;
        content: string;
      }>(
        connection,
        'SELECT id, customer_id, author_id, content FROM communications WHERE id = ? LIMIT 1 FOR UPDATE',
        [commentId]
      );

      if (!comment) return { ok: false as const, error: 'That comment no longer exists.' };
      // Covers the rows imported from Vtiger that never resolved to a user.
      if (!comment.author_id || comment.author_id !== actor.id) {
        return { ok: false as const, error: 'You can only delete your own comments.' };
      }

      const tagged = await queryRowsOn<{ kind: string; name: string }>(
        connection,
        `SELECT IF(cm.contact_id IS NULL, 'user', 'contact') AS kind,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), u.name) AS name
           FROM communication_mentions cm
           LEFT JOIN contacts c ON c.id = cm.contact_id
           LEFT JOIN users u ON u.id = cm.user_id
          WHERE cm.communication_id = ?
          ORDER BY (cm.contact_id IS NULL) ASC, name ASC`,
        [commentId]
      );

      await runOn(connection, 'DELETE FROM communications WHERE id = ?', [commentId]);

      const taggedNames = tagged.map((row) =>
        row.kind === 'contact' ? `${row.name} (contact)` : row.name
      );
      const description = [
        'Comment deleted',
        `“${commentSnippet(comment.content)}”`,
        taggedNames.length > 0 ? `had tagged ${taggedNames.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      await logActivity(connection, {
        customerId: comment.customer_id,
        actorId: actor.id,
        action: 'COMMENT_DELETED',
        entityType: 'COMMENT',
        entityId: comment.id,
        description,
      });

      return { ok: true as const, id: comment.id, customerId: comment.customer_id };
    });
  } catch (error) {
    console.error('[customers] comment delete failed', error);
    return { ok: false, error: 'Could not delete the comment. Please try again.' };
  }
}

export async function getCustomer(id: string): Promise<CustomerDetail | undefined> {
  await verifySession();

  return queryOne<CustomerDetail>(
    `SELECT ${CUSTOMER_COLUMNS},
            cu.vtiger_account_id
     ${CUSTOMER_JOINS}
      WHERE cu.id = ?
      LIMIT 1`,
    [id]
  );
}

export async function getCustomerContacts(customerId: string): Promise<ContactRow[]> {
  await verifySession();

  return queryRows<ContactRow>(
    `SELECT id, first_name, last_name, email, phone
       FROM contacts
      WHERE customer_id = ?
      ORDER BY last_name ASC, first_name ASC`,
    [customerId]
  );
}

/** Everyone who can be tagged in a comment: the colleagues on the account (all users). */
export async function getMentionablePeople(): Promise<{ id: string; name: string }[]> {
  await verifySession();

  return queryRows<{ id: string; name: string }>('SELECT id, name FROM users ORDER BY name ASC');
}

/**
 * Attaches the tags to a page of comments with one extra query (never one per row).
 * Contacts come first, then colleagues, each alphabetical.
 */
async function withMentions<TRow extends { id: string }>(
  rows: TRow[]
): Promise<(TRow & { mentions: MentionRef[] })[]> {
  if (rows.length === 0) return [];

  const mentions = await queryRows<{
    communication_id: string;
    contact_id: string | null;
    user_id: string | null;
    contact_name: string | null;
    user_name: string | null;
  }>(
    `SELECT cm.communication_id, cm.contact_id, cm.user_id,
            CONCAT_WS(' ', c.first_name, c.last_name) AS contact_name,
            u.name AS user_name
       FROM communication_mentions cm
       LEFT JOIN contacts c ON c.id = cm.contact_id
       LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.communication_id IN (${rows.map(() => '?').join(', ')})`,
    rows.map((row) => row.id)
  );

  const byComment = new Map<string, MentionRef[]>();
  for (const mention of mentions) {
    const ref: MentionRef = mention.contact_id
      ? { kind: 'contact', id: mention.contact_id, name: mention.contact_name?.trim() || 'Unnamed contact' }
      : { kind: 'user', id: mention.user_id ?? '', name: mention.user_name ?? 'Unknown user' };

    const list = byComment.get(mention.communication_id);
    if (list) list.push(ref);
    else byComment.set(mention.communication_id, [ref]);
  }

  for (const list of byComment.values()) {
    list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'contact' ? -1 : 1));
  }

  return rows.map((row) => ({ ...row, mentions: byComment.get(row.id) ?? [] }));
}

export async function getCustomerAddresses(customerId: string): Promise<AddressRow[]> {
  await verifySession();

  return queryRows<AddressRow>(
    `SELECT id, address_type, address, address_line2, town, city, county, postcode, country, is_default, source
       FROM customer_addresses
      WHERE customer_id = ?
      ORDER BY address_type ASC, is_default DESC, postcode ASC`,
    [customerId]
  );
}

export async function getCustomerDocuments(customerId: string): Promise<DocumentRow[]> {
  await verifySession();

  return queryRows<DocumentRow>(
    `SELECT id, title, document_path, storage_type, document_type, mime_type, file_size, document_expiry_date, created_at
       FROM documents
      WHERE customer_id = ?
      ORDER BY (document_expiry_date IS NULL) ASC, document_expiry_date ASC, created_at DESC`,
    [customerId]
  );
}

export async function getCustomerQuotes(customerId: string): Promise<QuoteRow[]> {
  await verifySession();

  return queryRows<QuoteRow>(
    `SELECT q.id, q.quote_no, q.quote_name, q.quote_date, q.valid_until, q.status, q.amount, q.currency, q.notes,
            qt.name AS quote_type_name,
            creator.name AS created_by_name
       FROM quotes q
       LEFT JOIN quote_types qt ON qt.id = q.quote_type_id
       LEFT JOIN users creator ON creator.id = q.created_by
      WHERE q.customer_id = ?
      ORDER BY q.quote_date DESC, q.created_at DESC`,
    [customerId]
  );
}

export async function getCustomerCommunications(
  customerId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<CommunicationListItem>> {
  await verifySession();

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM communications WHERE customer_id = ?',
    [customerId]
  );
  const total = Number(totalRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const rows = await withMentions(
    await queryRows<Omit<CommunicationListItem, 'mentions'>>(
      `SELECT c.id, c.content, c.communication_type, c.created_at, c.customer_id,
              cu.account_no, cu.name AS customer_name, c.author_id, u.name AS author_name
         FROM communications c
         JOIN customers cu ON cu.id = c.customer_id
         LEFT JOIN users u ON u.id = c.author_id
        WHERE c.customer_id = ?
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?`,
      [customerId, pageSize, (page - 1) * pageSize]
    )
  );

  return { rows, total, page, pageCount };
}

export async function getCustomerActivity(
  customerId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<ActivityRow>> {
  await verifySession();

  const pageSize = options.pageSize ?? 20;
  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM customer_activity WHERE customer_id = ?',
    [customerId]
  );
  const total = Number(totalRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const rows = await queryRows<ActivityRow>(
    `SELECT ca.id, ca.action, ca.entity_type, ca.entity_id, ca.field_name, ca.old_value, ca.new_value,
            ca.description, ca.created_at, u.name AS actor_name
       FROM customer_activity ca
       LEFT JOIN users u ON u.id = ca.actor_id
      WHERE ca.customer_id = ?
      ORDER BY ca.created_at DESC
      LIMIT ? OFFSET ?`,
    [customerId, pageSize, (page - 1) * pageSize]
  );

  return { rows, total, page, pageCount };
}
