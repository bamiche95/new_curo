/**
 * Read and write queries for the users screen (`/settings/users`).
 *
 * Administrator-only: the page is gated by `verifyAdminPage()`, and every write
 * re-checks `isAdmin` here as well, because a 404 cannot stop a direct POST.
 *
 * Deleting a user is never blocked by the database — every foreign key to `users`
 * either cascades (`user_saved_views`, `communication_mentions`,
 * `assignment_group_members`) or nulls out (`customers.assigned_to`,
 * `customers.deleted_by`, `customer_activity.actor_id`, `communications.author_id`,
 * `documents.created_by`, `quotes.created_by`/`modified_by`) — so the guards that
 * matter (not yourself, never the last administrator) live in this module, and the
 * counts are read first so the confirmation can say what a delete would do.
 */
import 'server-only';

import { v4 as uuidv4 } from 'uuid';
import type { PoolConnection } from 'mysql2/promise';

import { verifySession } from '@/lib/auth/dal';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { queryOne, queryOneOn, queryRows, run, runOn, withTransaction } from '@/lib/db';
import type { UserRow } from '@/lib/data/types';

const ADMIN_ONLY_ERROR = 'Only administrators can do that.';
const NAME_MAX_LENGTH = 255;
const EMAIL_MAX_LENGTH = 255;
/** The same shape `login.ts` accepts, so an account can always sign in. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserInput = {
  name: string;
  email: string;
  isAdmin: boolean;
  /** Blank keeps the current password on edit, and leaves a new account unable to sign in. */
  password: string;
};

export type UserWriteResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string; field?: string };

export type UserDeleteResult =
  | {
      ok: true;
      name: string;
      /** Customers left unassigned by the delete. */
      customersUnassigned: number;
      savedViewsRemoved: number;
      commentTagsRemoved: number;
      membershipsRemoved: number;
    }
  | { ok: false; error: string };

/** Every user, administrators first, with the counts a delete would affect. */
const USER_SELECT = `
        u.id,
        u.name,
        u.email,
        u.is_admin,
        u.must_change_password,
        (u.password_hash IS NOT NULL) AS has_password,
        u.locked_until,
        (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS is_locked,
        u.last_login_at,
        u.password_changed_at,
        u.vtiger_user_id,
        (SELECT COUNT(*) FROM customers cu WHERE cu.assigned_to = u.id) AS customers_owned,
        (SELECT COUNT(*) FROM user_saved_views v WHERE v.user_id = u.id) AS saved_views,
        (SELECT COUNT(*) FROM communication_mentions m WHERE m.user_id = u.id) AS comment_tags,
        (SELECT COUNT(*) FROM assignment_group_members g WHERE g.user_id = u.id) AS group_memberships
   FROM users u`;

export async function listUsers(): Promise<UserRow[]> {
  await verifySession();

  return queryRows<UserRow>(`SELECT ${USER_SELECT} ORDER BY u.is_admin DESC, u.name ASC`);
}

/**
 * Shape checks shared by create and edit. The email is stored lower case because
 * `authenticateWithCredentials()` lower-cases what it is given before it looks an
 * account up, so "Adam@…" and "adam@…" have to be the same account.
 */
function readUserFields(input: {
  name?: string;
  email?: string;
}): { ok: true; name: string; email: string } | { ok: false; error: string; field: string } {
  const name = String(input?.name ?? '').trim();
  const email = String(input?.email ?? '').trim().toLowerCase();

  if (name === '') return { ok: false, error: 'Give the user a name.', field: 'name' };
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Names are at most ${NAME_MAX_LENGTH} characters.`, field: 'name' };
  }
  if (email === '') return { ok: false, error: 'Give the user an email address.', field: 'email' };
  if (email.length > EMAIL_MAX_LENGTH) {
    return { ok: false, error: `Email addresses are at most ${EMAIL_MAX_LENGTH} characters.`, field: 'email' };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: `"${email}" is not a valid email address.`, field: 'email' };
  }

  return { ok: true, name, email };
}

/** The email column is UNIQUE, so a clash has to read as a form error, not a crash. */
function isDuplicateEntry(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'ER_DUP_ENTRY');
}

/**
 * A submitted temporary password, or `null` when the field was left blank. What an
 * administrator types is always *temporary*: it is stored with
 * `must_change_password = 1`, so the account is asked to choose its own at the next
 * sign-in, and every session it had is invalidated (`token_version`).
 */
async function readTemporaryPassword(
  value: string
): Promise<{ ok: true; hash: string | null } | { ok: false; error: string }> {
  const password = String(value ?? '');
  if (password === '') return { ok: true, hash: null };

  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { ok: false, error: strengthError };

  return { ok: true, hash: await hashPassword(password) };
}

/** How many accounts hold the admin flag: the last one may never be removed or demoted. */
async function countAdmins(connection?: PoolConnection): Promise<number> {
  const sql = 'SELECT COUNT(*) AS admins FROM users WHERE is_admin = 1';
  const row = connection
    ? await queryOneOn<{ admins: number }>(connection, sql)
    : await queryOne<{ admins: number }>(sql);
  return Number(row?.admins ?? 0);
}

/**
 * Adds an account. Administrators only.
 *
 * A blank password is allowed on purpose: `password_hash` stays NULL, which the
 * login path already treats as "no password set, cannot sign in", so accounts can
 * be created first and their passwords issued later.
 */
export async function createUser(input: UserInput): Promise<UserWriteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };

  const fields = readUserFields(input);
  if (!fields.ok) return fields;

  const password = await readTemporaryPassword(input?.password);
  if (!password.ok) return { ok: false, error: password.error, field: 'password' };

  const id = uuidv4();

  try {
    await run(
      `INSERT INTO users (id, name, email, password_hash, must_change_password, is_admin, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        fields.name,
        fields.email,
        password.hash,
        password.hash ? 1 : 0,
        input?.isAdmin ? 1 : 0,
        password.hash ? new Date() : null,
      ]
    );
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: 'Another account already uses that email address.', field: 'email' };
    }
    console.error('[users] create failed', error);
    return { ok: false, error: 'Could not add that user. Please try again.' };
  }

  return { ok: true, id, name: fields.name };
}

/** Saves an account, and optionally issues a new temporary password. Administrators only. */
export async function updateUser(id: string, input: UserInput): Promise<UserWriteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing user.' };

  const fields = readUserFields(input);
  if (!fields.ok) return fields;

  const password = await readTemporaryPassword(input?.password);
  if (!password.ok) return { ok: false, error: password.error, field: 'password' };

  const existing = await queryOne<{ id: string; is_admin: number }>(
    'SELECT id, is_admin FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  if (!existing) return { ok: false, error: 'That user no longer exists.' };

  // Demoting the only administrator would lock everyone out of this screen.
  if (existing.is_admin === 1 && !input?.isAdmin && (await countAdmins()) <= 1) {
    return { ok: false, error: 'That is the last administrator — promote someone else first.', field: 'isAdmin' };
  }

  try {
    if (password.hash) {
      // A temporary password clears any lockout and signs the account out
      // everywhere: the DAL compares `token_version` on every request.
      await run(
        `UPDATE users
            SET name = ?,
                email = ?,
                is_admin = ?,
                password_hash = ?,
                must_change_password = 1,
                password_changed_at = NOW(),
                token_version = token_version + 1,
                failed_attempts = 0,
                locked_until = NULL
          WHERE id = ?`,
        [fields.name, fields.email, input?.isAdmin ? 1 : 0, password.hash, id]
      );
    } else {
      await run('UPDATE users SET name = ?, email = ?, is_admin = ? WHERE id = ?', [
        fields.name,
        fields.email,
        input?.isAdmin ? 1 : 0,
        id,
      ]);
    }
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return { ok: false, error: 'Another account already uses that email address.', field: 'email' };
    }
    console.error('[users] update failed', error);
    return { ok: false, error: 'Could not save that user. Please try again.' };
  }

  return { ok: true, id, name: fields.name };
}

/**
 * Removes an account for good. Administrators only, and never their own account.
 *
 * No customer is ever deleted (`customers.assigned_to` is ON DELETE SET NULL) and
 * no historical record loses its text — the actor links are merely cleared. What
 * *is* destroyed — saved views, comment tags, group memberships — is counted first
 * and handed back, so the confirmation can say what is about to go.
 */
export async function deleteUser(id: string): Promise<UserDeleteResult> {
  const actor = await verifySession();
  if (!actor.isAdmin) return { ok: false, error: ADMIN_ONLY_ERROR };
  if (!id) return { ok: false, error: 'Missing user.' };
  if (id === actor.id) return { ok: false, error: 'You cannot delete the account you are signed in with.' };

  try {
    return await withTransaction(async (connection) => {
      const user = await queryOneOn<{ name: string; is_admin: number }>(
        connection,
        'SELECT name, is_admin FROM users WHERE id = ? LIMIT 1',
        [id]
      );
      if (!user) return { ok: false, error: 'That user no longer exists.' };

      if (user.is_admin === 1 && (await countAdmins(connection)) <= 1) {
        return { ok: false, error: 'That is the last administrator — promote someone else first.' };
      }

      const impacts = await queryOneOn<{
        customers_unassigned: number;
        saved_views: number;
        comment_tags: number;
        memberships: number;
      }>(
        connection,
        `SELECT (SELECT COUNT(*) FROM customers WHERE assigned_to = ?) AS customers_unassigned,
                (SELECT COUNT(*) FROM user_saved_views WHERE user_id = ?) AS saved_views,
                (SELECT COUNT(*) FROM communication_mentions WHERE user_id = ?) AS comment_tags,
                (SELECT COUNT(*) FROM assignment_group_members WHERE user_id = ?) AS memberships`,
        [id, id, id, id]
      );

      await runOn(connection, 'DELETE FROM users WHERE id = ?', [id]);

      return {
        ok: true,
        name: user.name,
        customersUnassigned: Number(impacts?.customers_unassigned ?? 0),
        savedViewsRemoved: Number(impacts?.saved_views ?? 0),
        commentTagsRemoved: Number(impacts?.comment_tags ?? 0),
        membershipsRemoved: Number(impacts?.memberships ?? 0),
      };
    });
  } catch (error) {
    console.error('[users] delete failed', error);
    return { ok: false, error: 'Could not delete that user. Please try again.' };
  }
}
