/**
 * Read and write queries for the contact screens.
 *
 * A contact always belongs to a customer (`contacts.customer_id` is NOT NULL, with
 * `ON DELETE CASCADE`), so every read joins the customer and every list row knows
 * which account it is attached to.
 *
 * Every exported function re-verifies the session, so these can never be read or
 * written by an unauthenticated caller even if Proxy were bypassed.
 */
import 'server-only';

import type { PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

import { verifySession, type AuthUser } from '@/lib/auth/dal';
import type { ContactQueryState } from '@/lib/contact-query';
import {
  queryOne,
  queryOneOn,
  queryRows,
  queryRowsOn,
  runOn,
  withTransaction,
  type SqlParam,
} from '@/lib/db';
import type { ContactDetail, ContactOption, ContactTableRow, PagedResult } from '@/lib/data/types';

/** Every read shares this projection, so a row and a record always agree. */
const CONTACT_SELECT = `
        t.id,
        t.first_name,
        t.last_name,
        t.email,
        t.phone,
        t.customer_id,
        cu.name       AS customer_name,
        cu.account_no AS customer_account_no,
        t.vtiger_contact_id AS vtiger`;

const CONTACT_JOINS = `
    FROM contacts t
    JOIN customers cu ON cu.id = t.customer_id`;

function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/** An unreasonably large selection is refused rather than turned into a huge `IN` list. */
const MAX_BATCH = 500;

const placeholders = (ids: string[]) => ids.map(() => '?').join(', ');

/** Shape and size check shared by the bulk actions. */
function normalizeIds(ids: string[]): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(ids)) return { ok: false, error: 'Select at least one contact.' };

  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id !== '')));
  if (unique.length === 0) return { ok: false, error: 'Select at least one contact.' };
  if (unique.length > MAX_BATCH) {
    return { ok: false, error: `Delete at most ${MAX_BATCH} contacts at a time.` };
  }

  return { ok: true, ids: unique };
}

/**
 * Text columns and the SQL they match on. `name` is the displayed contact name, so
 * it spans both name columns; `account`/`account_no` come from the joined customer.
 */
const TEXT_FILTER_SQL: Record<string, string> = {
  name: "(CONCAT_WS(' ', t.first_name, t.last_name))",
  first_name: 't.first_name',
  last_name: 't.last_name',
  email: 't.email',
  phone: 't.phone',
  account: 'cu.name',
  account_no: 'cu.account_no',
};

const NUMERIC_FILTER_SQL: Record<string, string> = {
  vtiger: 't.vtiger_contact_id',
};

const SORT_SQL: Record<string, string> = {
  name: "(CONCAT_WS(' ', t.first_name, t.last_name))",
  first_name: 't.first_name',
  last_name: 't.last_name',
  email: 't.email',
  phone: 't.phone',
  account: 'cu.name',
  account_no: 'cu.account_no',
  vtiger: 't.vtiger_contact_id',
};

/** Translates the per-column filters into SQL. Values within one column are OR'd. */
function buildContactWhere(state: ContactQueryState): { where: string; params: SqlParam[] } {
  // A contact of an archived customer is hidden with its customer, until an
  // administrator restores it from /customers/archived.
  const clauses: string[] = ['cu.deleted_at IS NULL'];
  const params: SqlParam[] = [];

  for (const [key, values] of Object.entries(state.filters)) {
    if (values.length === 0) continue;
    const sql = TEXT_FILTER_SQL[key];
    if (!sql) continue;
    clauses.push(`(${values.map(() => `${sql} LIKE ?`).join(' OR ')})`);
    params.push(...values.map(likeTerm));
  }

  for (const [key, range] of Object.entries(state.ranges)) {
    const sql = NUMERIC_FILTER_SQL[key];
    if (!sql) continue;
    if (range.min !== undefined) {
      clauses.push(`${sql} >= ?`);
      params.push(range.min);
    }
    if (range.max !== undefined) {
      clauses.push(`${sql} <= ?`);
      params.push(range.max);
    }
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** The flexible contacts table query: multi-value filters, sorting and paging. */
export async function listContacts(state: ContactQueryState): Promise<PagedResult<ContactTableRow>> {
  await verifySession();

  const { where, params } = buildContactWhere(state);

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total ${CONTACT_JOINS} ${where}`,
    params
  );
  const total = Number(totalRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / state.size));
  const page = Math.min(Math.max(1, state.page), pageCount);

  const orderBy = SORT_SQL[state.sort] ?? SORT_SQL.name;
  const direction = state.dir === 'desc' ? 'DESC' : 'ASC';

  const rows = await queryRows<ContactTableRow>(
    `SELECT ${CONTACT_SELECT}
     ${CONTACT_JOINS}
     ${where}
      ORDER BY ${orderBy} ${direction}, t.last_name ASC, t.first_name ASC
      LIMIT ? OFFSET ?`,
    [...params, state.size, (page - 1) * state.size]
  );

  return { rows, total, page, pageCount };
}

/** One contact, with the customer it is attached to. */
export async function getContact(contactId: string): Promise<ContactDetail | null> {
  await verifySession();

  const row = await queryOne<ContactDetail>(
    `SELECT ${CONTACT_SELECT}
     ${CONTACT_JOINS}
      WHERE t.id = ?
      LIMIT 1`,
    [contactId]
  );

  return row ?? null;
}

/** The customer behind an id, for the attach picker's initial value. */
export async function getCustomerOption(customerId: string): Promise<ContactOption | null> {
  await verifySession();

  const row = await queryOne<ContactOption>(
    `SELECT id, name, account_no
       FROM customers
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [customerId]
  );

  return row ?? null;
}

/**
 * Customers matching a typed term, for the attach picker.
 *
 * There are thousands of customers, so the picker searches on demand (name or
 * account number, 20 at a time) rather than shipping the whole list into the page.
 * An empty term returns the first page of customers, so the picker opens with
 * something to click.
 */
export async function searchCustomers(term: string, limit = 20): Promise<ContactOption[]> {
  await verifySession();

  const trimmed = term.trim();

  if (trimmed === '') {
    return queryRows<ContactOption>(
      `SELECT id, name, account_no
         FROM customers
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        LIMIT ?`,
      [limit]
    );
  }

  const like = likeTerm(trimmed);
  return queryRows<ContactOption>(
    `SELECT id, name, account_no
       FROM customers
      WHERE deleted_at IS NULL AND (name LIKE ? OR account_no LIKE ?)
      ORDER BY name ASC
      LIMIT ?`,
    [like, like, limit]
  );
}


/** Everything the create/edit form submits, reduced to trimmed strings by the action. */
export type ContactInput = {
  /** The customer the contact belongs to (the attach picker). */
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type ContactWriteResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

/** Column widths, mirroring `contacts` exactly. */
const CONTACT_LIMITS = { firstName: 100, lastName: 100, email: 255, phone: 50 } as const;

/** Deliberately loose: `something@something.something`, nothing more. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A contact's display name, with a fallback for a row with no first name. */
function contactName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unnamed contact';
}

function blankToNull(value: string): string | null {
  return value === '' ? null : value;
}

type NormalisedContact = {
  customerId: string;
  /** The customer's name, so the trail can say where a contact sits. */
  customerName: string;
  firstName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
};

/** Shape checks plus the existence check for the attached customer. */
async function validateContactInput(
  input: ContactInput
): Promise<{ ok: true; value: NormalisedContact } | { ok: false; error: string; field?: string }> {
  const customerId = input.customerId.trim();
  if (customerId === '') {
    return { ok: false, error: 'Choose the customer this contact belongs to.', field: 'customerId' };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();

  if (lastName === '') return { ok: false, error: 'Last name is required.', field: 'lastName' };
  if (firstName.length > CONTACT_LIMITS.firstName) {
    return { ok: false, error: `First name is limited to ${CONTACT_LIMITS.firstName} characters.`, field: 'firstName' };
  }
  if (lastName.length > CONTACT_LIMITS.lastName) {
    return { ok: false, error: `Last name is limited to ${CONTACT_LIMITS.lastName} characters.`, field: 'lastName' };
  }
  if (email.length > CONTACT_LIMITS.email) {
    return { ok: false, error: `Email is limited to ${CONTACT_LIMITS.email} characters.`, field: 'email' };
  }
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'That does not look like an email address.', field: 'email' };
  }
  if (phone.length > CONTACT_LIMITS.phone) {
    return { ok: false, error: `Phone is limited to ${CONTACT_LIMITS.phone} characters.`, field: 'phone' };
  }

  // Archived customers are invisible to the picklists, so a stale id must not attach
  // a contact to one.
  const customer = await queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [customerId]
  );
  if (!customer) {
    return {
      ok: false,
      error: 'That customer no longer exists — pick another one.',
      field: 'customerId',
    };
  }

  return {
    ok: true,
    value: {
      customerId: customer.id,
      customerName: customer.name,
      firstName: blankToNull(firstName),
      lastName,
      email: blankToNull(email),
      phone: blankToNull(phone),
    },
  };
}


/**
 * Appends one description-only row to a customer's activity trail (same connection
 * as the change itself). Contact events are stored against the customer the contact
 * belongs to, with `entity_type = 'CONTACT'` and the contact's id as `entity_id`, so
 * they show on that customer's Updates tab.
 */
async function logActivityOn(
  connection: PoolConnection,
  entry: {
    customerId: string;
    action: string;
    entityId: string;
    description: string;
    actorId: string;
  }
): Promise<void> {
  await runOn(
    connection,
    `INSERT INTO customer_activity
       (id, customer_id, action, entity_type, entity_id, description, actor_id)
     VALUES (?, ?, ?, 'CONTACT', ?, ?, ?)`,
    [uuidv4(), entry.customerId, entry.action, entry.entityId, entry.description, entry.actorId]
  );
}

/** Appends one field-level change (old → new) to a customer's activity trail. */
async function logFieldChangeOn(
  connection: PoolConnection,
  entry: {
    customerId: string;
    entityId: string;
    fieldName: string;
    previous: string | null;
    next: string | null;
    actorId: string;
  }
): Promise<void> {
  await runOn(
    connection,
    `INSERT INTO customer_activity
       (id, customer_id, action, entity_type, entity_id, field_name, old_value, new_value, actor_id)
     VALUES (?, ?, 'CONTACT_UPDATED', 'CONTACT', ?, ?, ?, ?, ?)`,
    [uuidv4(), entry.customerId, entry.entityId, entry.fieldName, entry.previous, entry.next, entry.actorId]
  );
}

/**
 * Creates a contact attached to a customer, recording it on that customer's activity
 * trail so the customer's Updates tab shows who was added. Contact and trail row land
 * in one transaction, so a half-saved contact is impossible.
 */
export async function createContact(input: ContactInput): Promise<ContactWriteResult> {
  const actor = await verifySession();
  const validated = await validateContactInput(input);
  if (!validated.ok) return validated;
  const value = validated.value;

  const id = uuidv4();
  const name = contactName(value.firstName, value.lastName);

  try {
    await withTransaction(async (connection) => {
      await runOn(
        connection,
        `INSERT INTO contacts (id, customer_id, first_name, last_name, email, phone)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, value.customerId, value.firstName, value.lastName, value.email, value.phone]
      );

      await logActivityOn(connection, {
        customerId: value.customerId,
        action: 'CONTACT_CREATED',
        entityId: id,
        description: `Contact ${name} added by ${actor.name}`,
        actorId: actor.id,
      });
    });

    return { ok: true, id };
  } catch (error) {
    console.error('[contacts] create failed', error);
    return { ok: false, error: 'Could not save the contact. Please try again.' };
  }
}


/** The current row shape read back before an update, so changes can be diffed. */
type CurrentContact = {
  customer_id: string;
  customer_name: string;
  first_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
};

/**
 * Saves the whole contact in one transaction: re-points it at its customer (the
 * attach picker may have changed), writes every edited field and records the change
 * on the customer's activity trail — one `CONTACT_UPDATED` row per changed field, or
 * a `CONTACT_MOVED` entry on both customers when the contact changes hands.
 */
export async function updateContact(contactId: string, input: ContactInput): Promise<ContactWriteResult> {
  const actor = await verifySession();
  const validated = await validateContactInput(input);
  if (!validated.ok) return validated;
  const value = validated.value;

  try {
    return await withTransaction(async (connection) => {
      const current = await queryOneOn<CurrentContact>(
        connection,
        `SELECT t.customer_id, cu.name AS customer_name, t.first_name, t.last_name, t.email, t.phone
           FROM contacts t
           JOIN customers cu ON cu.id = t.customer_id
          WHERE t.id = ?
          LIMIT 1`,
        [contactId]
      );
      if (!current) return { ok: false as const, error: 'That contact no longer exists.' };

      const changes: { field: string; previous: string | null; next: string | null }[] = [];
      if (value.firstName !== current.first_name) {
        changes.push({ field: 'first_name', previous: current.first_name, next: value.firstName });
      }
      if (value.lastName !== current.last_name) {
        changes.push({ field: 'last_name', previous: current.last_name, next: value.lastName });
      }
      if (value.email !== current.email) {
        changes.push({ field: 'email', previous: current.email, next: value.email });
      }
      if (value.phone !== current.phone) {
        changes.push({ field: 'phone', previous: current.phone, next: value.phone });
      }

      const moved = value.customerId !== current.customer_id;
      if (!moved && changes.length === 0) return { ok: true as const, id: contactId };

      await runOn(
        connection,
        `UPDATE contacts
            SET customer_id = ?, first_name = ?, last_name = ?, email = ?, phone = ?
          WHERE id = ?`,
        [value.customerId, value.firstName, value.lastName, value.email, value.phone, contactId]
      );

      const name = contactName(value.firstName, value.lastName);

      if (moved) {
        // Both customers keep a note: the trail is per customer, so one row each side
        // is what makes the hand-over visible from either account.
        await logActivityOn(connection, {
          customerId: current.customer_id,
          action: 'CONTACT_MOVED',
          entityId: contactId,
          description: `Contact ${name} moved to ${value.customerName} by ${actor.name}`,
          actorId: actor.id,
        });
        await logActivityOn(connection, {
          customerId: value.customerId,
          action: 'CONTACT_MOVED',
          entityId: contactId,
          description: `Contact ${name} moved from ${current.customer_name} by ${actor.name}`,
          actorId: actor.id,
        });
      } else {
        for (const change of changes) {
          await logFieldChangeOn(connection, {
            customerId: value.customerId,
            entityId: contactId,
            fieldName: change.field,
            previous: change.previous,
            next: change.next,
            actorId: actor.id,
          });
        }
      }

      return { ok: true as const, id: contactId };
    });
  } catch (error) {
    console.error('[contacts] update failed', error);
    return { ok: false, error: 'Could not save the contact. Please try again.' };
  }
}

/** The rows a delete needs: the customer each contact hangs off, and its name for the trail. */
type DeletableContact = {
  id: string;
  customer_id: string;
  first_name: string | null;
  last_name: string;
};

/**
 * Deletes every named contact on an open transaction and writes one `CONTACT_DELETED`
 * row per contact to *its own* customer's trail.
 *
 * The rows are read (and locked) before the delete, so a trail row can never describe
 * a contact that was already gone, and the contacts and their trail rows are written
 * together — one transaction, or nothing. The contacts' comment tags cascade away
 * through `communication_mentions`.
 */
async function deleteContactsOn(
  connection: PoolConnection,
  actor: AuthUser,
  ids: string[]
): Promise<DeletableContact[]> {
  const rows = await queryRowsOn<DeletableContact>(
    connection,
    `SELECT id, customer_id, first_name, last_name
       FROM contacts
      WHERE id IN (${placeholders(ids)})
      FOR UPDATE`,
    ids
  );
  if (rows.length === 0) return [];

  const doomed = rows.map((row) => row.id);
  await runOn(connection, `DELETE FROM contacts WHERE id IN (${placeholders(doomed)})`, doomed);

  // One batched INSERT: a whole page of names would otherwise be a round trip each.
  const params: SqlParam[] = [];
  const tuples = rows.map((row) => {
    params.push(
      uuidv4(),
      row.customer_id,
      'CONTACT_DELETED',
      row.id,
      `Contact ${contactName(row.first_name, row.last_name)} deleted by ${actor.name}`,
      actor.id
    );
    return "(?, ?, ?, 'CONTACT', ?, ?, ?)";
  });

  await runOn(
    connection,
    `INSERT INTO customer_activity
       (id, customer_id, action, entity_type, entity_id, description, actor_id)
     VALUES ${tuples.join(', ')}`,
    params
  );

  return rows;
}

/**
 * Deletes one contact for good and records who removed it on the customer's trail.
 */
export async function deleteContact(
  contactId: string
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const actor = await verifySession();

  try {
    return await withTransaction(async (connection) => {
      const [deleted] = await deleteContactsOn(connection, actor, [contactId]);
      if (!deleted) return { ok: false as const, error: 'That contact no longer exists.' };

      return { ok: true as const, customerId: deleted.customer_id };
    });
  } catch (error) {
    console.error('[contacts] delete failed', error);
    return { ok: false, error: 'Could not delete the contact. Please try again.' };
  }
}

/**
 * Deletes the selected contacts in one transaction — the table's bulk action.
 *
 * Returns the distinct customer ids the selection touched, so the caller can
 * revalidate exactly those records: each one's Contacts tab count and Updates trail
 * have changed.
 */
export async function deleteContacts(
  ids: string[]
): Promise<{ ok: true; deleted: number; customerIds: string[] } | { ok: false; error: string }> {
  const actor = await verifySession();
  const target = normalizeIds(ids);
  if (!target.ok) return target;

  try {
    return await withTransaction(async (connection) => {
      const deleted = await deleteContactsOn(connection, actor, target.ids);

      return {
        ok: true as const,
        deleted: deleted.length,
        customerIds: Array.from(new Set(deleted.map((row) => row.customer_id))),
      };
    });
  } catch (error) {
    console.error('[contacts] bulk delete failed', error);
    return { ok: false, error: 'Could not delete the selected contacts. Please try again.' };
  }
}

