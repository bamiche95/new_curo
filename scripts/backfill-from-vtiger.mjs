/**
 * Backfills customer data from the legacy Vtiger database into `curo_next_db`.
 *
 *   npm run db:backfill-vtiger                 # status + industry + addresses + assignment + admins
 *   npm run db:backfill-vtiger -- --status     # only one of the five
 *   npm run db:backfill-vtiger -- --industry
 *   npm run db:backfill-vtiger -- --addresses
 *   npm run db:backfill-vtiger -- --assignment
 *   npm run db:backfill-vtiger -- --admins
 *   npm run db:backfill-vtiger -- --dry-run    # report only, write nothing
 *
 * Safe to re-run:
 *   - status and industry are plain UPDATEs matched on customers.vtiger_account_id;
 *   - addresses previously imported from Vtiger (source = 'VTIGER') are replaced,
 *     while addresses added by hand (source = 'MANUAL') are never touched;
 *   - assignment imports the Vtiger groups and their role-derived members
 *     (membership rows carry source = 'VTIGER' and are replaced on re-run), then
 *     fills customers.assigned_to / assigned_group_id — but only for customers
 *     that have no owner yet, so an in-app reassignment is never overwritten;
 *   - admins mirrors vtiger_users.is_admin ('on' -> users.is_admin = 1) onto the
 *     matching rows, which is what gates the Archived-customers page.
 *
 * Also acts as the repair tool: re-running `node migration_plan.js` recreates the
 * customers with new UUIDs, which drops these assignments - run this again after.
 */
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

import { loadEnv, newDbConfig, vtigerDbConfig } from './lib/load-env.mjs';

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has('--dry-run');
const explicit =
  flags.has('--status') ||
  flags.has('--industry') ||
  flags.has('--addresses') ||
  flags.has('--assignment') ||
  flags.has('--admins');
const wants = {
  status: !explicit || flags.has('--status'),
  industry: !explicit || flags.has('--industry'),
  addresses: !explicit || flags.has('--addresses'),
  assignment: !explicit || flags.has('--assignment'),
  admins: !explicit || flags.has('--admins'),
};

/** Vtiger cf_799 values (normalised) -> customer_id_statuses.code */
const STATUS_BY_VALUE = new Map([
  ['new business', 'NEW_BUSINESS'],
  ['marketing (w.i.p)', 'MARKETING_WIP'],
  ['customer', 'CUSTOMER'],
  ['customer - one off', 'CUSTOMER_ONEOFF'],
  ['customer - oneoff', 'CUSTOMER_ONEOFF'],
  ['contractor', 'CONTRACTOR'],
  ['closed', 'CLOSED'],
  ['opted out', 'OPTED_OUT'],
  ['archive', 'ARCHIVE'],
  ['ex-customer', 'EX_CUSTOMER'],
  ['broker', 'BROKER'],
  ['private', 'PRIVATE'],
  ['disposal site', 'DISPOSAL_SITE'],
  ['in administration', 'IN_ADMINISTRATION'],
  ['eyas', 'EYAS'],
  ['liquidation', 'LIQUIDATION'],
  ['hawkmet', 'HAWKMET'],
  ['c and r lewis', 'C_AND_R_LEWIS'],
  ['unknown', 'UNKNOWN'],
]);

/** Customers whose stored status no longer exists in the Vtiger picklist ("????"). */
const UNKNOWN_CODE = 'UNKNOWN';
const MOJIBAKE = /^\?+$/;

const normalise = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Loose key for matching names that differ only in spacing/punctuation. */
const matchKey = (value) => normalise(value).replace(/[^a-z0-9]/g, '');

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\r\n|\r|\n/g, ', ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
};

const truncate = (value, max) => (value && value.length > max ? value.slice(0, max) : value);

const chunk = (items, size) => {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

const mapStatusCode = (raw) => {
  const key = normalise(raw);
  if (key === '') return null;
  if (STATUS_BY_VALUE.has(key)) return STATUS_BY_VALUE.get(key);
  if (MOJIBAKE.test(key)) return UNKNOWN_CODE;
  return undefined; // reported as unmapped
};

loadEnv();

let app;
let vtiger;
try {
  app = await mysql.createConnection(newDbConfig());
  vtiger = await mysql.createConnection(vtigerDbConfig());
} catch (err) {
  console.error('❌ Could not connect to the databases:', err.message);
  process.exit(1);
}

/** Sets `customers.<column>` for the given customer ids, in chunks. */
async function assignLookup(column, lookupId, customerIds) {
  let changed = 0;
  for (const group of chunk(customerIds, 500)) {
    if (dryRun) continue;
    const [result] = await app.query(
      `UPDATE customers SET \`${column}\` = ? WHERE id IN (${group.map(() => '?').join(', ')})`,
      [lookupId, ...group]
    );
    changed += Number(result.changedRows ?? 0);
  }
  return changed;
}

/**
 * Sets one of the ownership columns, but only for customers that have no owner at
 * all - anything assigned (or reassigned) in the app is left alone.
 */
async function assignOwner(column, lookupId, customerIds) {
  const other = column === 'assigned_to' ? 'assigned_group_id' : 'assigned_to';
  let changed = 0;
  for (const group of chunk(customerIds, 500)) {
    if (dryRun) continue;
    const [result] = await app.query(
      `UPDATE customers
          SET \`${column}\` = ?
        WHERE id IN (${group.map(() => '?').join(', ')})
          AND \`${column}\` IS NULL
          AND \`${other}\` IS NULL`,
      [lookupId, ...group]
    );
    changed += Number(result.changedRows ?? 0);
  }
  return changed;
}

/** Vtiger groups that only exist to park dead records - imported, but deactivated. */
const INACTIVE_GROUPS = new Set(['delete', 'delete e-comm', 'archived contacts']);

/** `RML SUPPLIES` -> `RML_SUPPLIES` */
const codeFor = (value) => truncate(String(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''), 50);

try {
  const [customerRows] = await app.query(
    'SELECT id, vtiger_account_id FROM customers WHERE vtiger_account_id IS NOT NULL'
  );
  const customerIdByVtigerId = new Map(customerRows.map((row) => [String(row.vtiger_account_id), row.id]));
  console.log(
    `👥 ${customerIdByVtigerId.size} customers carry a Vtiger account id${dryRun ? ' — DRY RUN, nothing will be written' : ''}`
  );

  // ------------------------------------------------------------------ status
  if (wants.status) {
    const [lookupRows] = await app.query('SELECT id, code FROM customer_id_statuses');
    const statusIdByCode = new Map(lookupRows.map((row) => [row.code, row.id]));
    const [sourceRows] = await vtiger.query('SELECT accountid, cf_799 FROM vtiger_accountscf');

    const idsByCode = new Map();
    const unmapped = new Map();
    let blank = 0;

    for (const row of sourceRows) {
      const customerId = customerIdByVtigerId.get(String(row.accountid));
      if (!customerId) continue;
      const code = mapStatusCode(row.cf_799);
      if (code === null) {
        blank += 1;
        continue;
      }
      if (code === undefined) {
        const raw = normalise(row.cf_799) || '(empty)';
        unmapped.set(raw, (unmapped.get(raw) ?? 0) + 1);
        continue;
      }
      if (!statusIdByCode.has(code)) {
        console.error(`❌ Lookup code ${code} is missing - run: npm run db:seed-lookups`);
        process.exit(1);
      }
      if (!idsByCode.has(code)) idsByCode.set(code, []);
      idsByCode.get(code).push(customerId);
    }

    console.log('\n=== Customer status (vtiger_accountscf.cf_799) ===');
    let totalChanged = 0;
    for (const [code, ids] of [...idsByCode.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const changed = await assignLookup('customer_id_status_id', statusIdByCode.get(code), ids);
      totalChanged += changed;
      console.log(`  ${String(ids.length).padStart(5)} → ${code}${dryRun ? '' : ` (${changed} changed)`}`);
    }
    console.log(`  ${String(blank).padStart(5)} → left unassigned (blank in Vtiger)`);
    for (const [raw, count] of unmapped) {
      console.log(`  ${String(count).padStart(5)} → UNMAPPED value "${raw}" (left alone)`);
    }
    console.log(`  status assignments ${dryRun ? 'planned' : 'changed'}: ${totalChanged}`);
  }

  // ---------------------------------------------------------------- industry
  if (wants.industry) {
    const [lookupRows] = await app.query('SELECT id, name FROM industries');
    const industryIdByKey = new Map(lookupRows.map((row) => [matchKey(row.name), row.id]));
    const nameById = new Map(lookupRows.map((row) => [row.id, row.name]));
    const [sourceRows] = await vtiger.query('SELECT accountid, industry FROM vtiger_account');

    const idsByKey = new Map();
    const unmapped = new Map();
    let blank = 0;

    for (const row of sourceRows) {
      const customerId = customerIdByVtigerId.get(String(row.accountid));
      if (!customerId) continue;
      const value = clean(row.industry);
      if (!value) {
        blank += 1;
        continue;
      }
      const lookupId = industryIdByKey.get(matchKey(value));
      if (!lookupId) {
        unmapped.set(value, (unmapped.get(value) ?? 0) + 1);
        continue;
      }
      if (!idsByKey.has(lookupId)) idsByKey.set(lookupId, []);
      idsByKey.get(lookupId).push(customerId);
    }

    console.log('\n=== Industry (vtiger_account.industry) ===');
    let totalChanged = 0;
    for (const [lookupId, ids] of [...idsByKey.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const changed = await assignLookup('industry_id', lookupId, ids);
      totalChanged += changed;
      console.log(`  ${String(ids.length).padStart(5)} → ${nameById.get(lookupId)}${dryRun ? '' : ` (${changed} changed)`}`);
    }
    console.log(`  ${String(blank).padStart(5)} → left unassigned (blank in Vtiger)`);
    for (const [raw, count] of unmapped) {
      console.log(`  ${String(count).padStart(5)} → UNMAPPED value "${raw}" (left alone)`);
    }
    console.log(`  industry assignments ${dryRun ? 'planned' : 'changed'}: ${totalChanged}`);
  }

  // -------------------------------------------------------------- assignment
  if (wants.assignment) {
    // 1. the groups themselves ---------------------------------------------
    const [vtigerGroups] = await vtiger.query('SELECT groupid, groupname FROM vtiger_groups');
    const [storedGroups] = await app.query('SELECT id, code, name, vtiger_group_id FROM assignment_groups');
    const groupIdByVtigerId = new Map(
      storedGroups
        .filter((row) => row.vtiger_group_id !== null)
        .map((row) => [String(row.vtiger_group_id), row.id])
    );
    const groupNameById = new Map(storedGroups.map((row) => [row.id, row.name]));
    const usedCodes = new Set(storedGroups.map((row) => row.code));
    const inactive = [];
    let groupsCreated = 0;

    for (const row of vtigerGroups) {
      const name = truncate(clean(row.groupname) ?? `Group ${row.groupid}`, 100);
      const isActive = INACTIVE_GROUPS.has(normalise(name)) ? 0 : 1;
      if (!isActive) inactive.push(name);

      const existingId = groupIdByVtigerId.get(String(row.groupid));
      if (existingId) {
        if (!dryRun) {
          await app.query('UPDATE assignment_groups SET name = ?, is_active = ? WHERE id = ?', [
            name,
            isActive,
            existingId,
          ]);
        }
        continue;
      }

      let code = codeFor(name) || `GROUP_${row.groupid}`;
      while (usedCodes.has(code)) code = `${code}_${row.groupid}`.slice(0, 50);
      usedCodes.add(code);

      const id = uuidv4();
      if (!dryRun) {
        await app.query(
          `INSERT INTO assignment_groups (id, code, name, vtiger_group_id, sort_order, is_active)
           VALUES (?, ?, ?, ?, 0, ?)`,
          [id, code, name, row.groupid, isActive]
        );
      }
      groupIdByVtigerId.set(String(row.groupid), id);
      groupNameById.set(id, name);
      groupsCreated += 1;
    }

    console.log('\n=== Assignment groups (vtiger_groups) ===');
    console.log(`  ${vtigerGroups.length} group(s) in Vtiger, ${groupsCreated} new here${dryRun ? ' (planned)' : ''}`);
    console.log(`  deactivated: ${inactive.length > 0 ? inactive.join(', ') : 'none'}`);

    // 2. members, derived from Vtiger roles (direct roles only) -------------
    const [userRows] = await app.query('SELECT id, name, vtiger_user_id FROM users WHERE vtiger_user_id IS NOT NULL');
    const userIdByVtigerId = new Map(userRows.map((row) => [String(row.vtiger_user_id), row.id]));
    const userNameById = new Map(userRows.map((row) => [row.id, row.name]));

    const [groupRoles] = await vtiger.query('SELECT groupid, roleid FROM vtiger_group2role');
    const [userRoles] = await vtiger.query('SELECT userid, roleid FROM vtiger_user2role');

    const rolesByGroup = new Map();
    for (const row of groupRoles) {
      const key = String(row.groupid);
      if (!rolesByGroup.has(key)) rolesByGroup.set(key, new Set());
      rolesByGroup.get(key).add(String(row.roleid));
    }
    const usersByRole = new Map();
    for (const row of userRoles) {
      const userId = userIdByVtigerId.get(String(row.userid));
      if (!userId) continue;
      const role = String(row.roleid);
      if (!usersByRole.has(role)) usersByRole.set(role, []);
      usersByRole.get(role).push(userId);
    }

    console.log('\n=== Group members (vtiger_group2role + vtiger_user2role) ===');
    if (!dryRun) await app.query("DELETE FROM assignment_group_members WHERE source = 'VTIGER'");

    const memberRows = [];
    for (const [vtigerGroupId, groupId] of groupIdByVtigerId) {
      const roles = rolesByGroup.get(vtigerGroupId) ?? new Set();
      const members = new Set();
      for (const role of roles) for (const userId of usersByRole.get(role) ?? []) members.add(userId);
      for (const userId of members) memberRows.push([groupId, userId, 'VTIGER']);
      console.log(
        `  ${String(members.size).padStart(3)} member(s) → ${groupNameById.get(groupId)}` +
          (roles.size === 0 ? ' (no roles mapped in Vtiger - maintain by hand)' : '')
      );
    }

    if (!dryRun) {
      for (const batch of chunk(memberRows, 500)) {
        await app.query('INSERT IGNORE INTO assignment_group_members (group_id, user_id, source) VALUES ?', [batch]);
      }
    }
    console.log(`  membership rows ${dryRun ? 'planned' : 'written'}: ${memberRows.length}`);

    // 3. who owns each customer ---------------------------------------------
    const [ownerRows] = await vtiger.query(
      `SELECT a.accountid, c.smownerid
         FROM vtiger_account a
         JOIN vtiger_crmentity c ON c.crmid = a.accountid
        WHERE c.deleted = 0`
    );

    const idsByUserId = new Map();
    const idsByGroupId = new Map();
    let noOwner = 0;
    let unmappedOwners = 0;
    let alreadyAssigned = 0;

    // Ownership that is already set here was either written by a previous run or
    // by hand in the app - both are left exactly as they are.
    const [ownedRows] = await app.query(
      'SELECT id FROM customers WHERE assigned_to IS NOT NULL OR assigned_group_id IS NOT NULL'
    );
    const alreadyOwned = new Set(ownedRows.map((row) => row.id));

    for (const row of ownerRows) {
      const customerId = customerIdByVtigerId.get(String(row.accountid));
      if (!customerId) continue;
      const owner = String(row.smownerid ?? '');
      if (owner === '' || owner === '0') {
        noOwner += 1;
        continue;
      }
      if (alreadyOwned.has(customerId)) {
        alreadyAssigned += 1;
        continue;
      }
      const userId = userIdByVtigerId.get(owner);
      if (userId) {
        if (!idsByUserId.has(userId)) idsByUserId.set(userId, []);
        idsByUserId.get(userId).push(customerId);
        continue;
      }
      const groupId = groupIdByVtigerId.get(owner);
      if (groupId) {
        if (!idsByGroupId.has(groupId)) idsByGroupId.set(groupId, []);
        idsByGroupId.get(groupId).push(customerId);
        continue;
      }
      unmappedOwners += 1;
    }

    console.log('\n=== Owner (vtiger_crmentity.smownerid) ===');
    let peopleChanged = 0;
    let peoplePlanned = 0;
    for (const [userId, ids] of [...idsByUserId.entries()].sort((a, b) => b[1].length - a[1].length)) {
      peoplePlanned += ids.length;
      const changed = await assignOwner('assigned_to', userId, ids);
      peopleChanged += changed;
      console.log(
        `  ${String(ids.length).padStart(5)} owned by ${userNameById.get(userId)} (person)${dryRun ? '' : ` - ${changed} written`}`
      );
    }

    let groupsChanged = 0;
    let groupsPlanned = 0;
    for (const [groupId, ids] of [...idsByGroupId.entries()].sort((a, b) => b[1].length - a[1].length)) {
      groupsPlanned += ids.length;
      const changed = await assignOwner('assigned_group_id', groupId, ids);
      groupsChanged += changed;
      console.log(
        `  ${String(ids.length).padStart(5)} owned by ${groupNameById.get(groupId)} (group)${dryRun ? '' : ` - ${changed} written`}`
      );
    }

    console.log(`  ${String(noOwner).padStart(5)} with no owner in Vtiger`);
    if (alreadyAssigned > 0) {
      console.log(`  ${String(alreadyAssigned).padStart(5)} already assigned here - left untouched`);
    }
    if (unmappedOwners > 0) {
      console.log(`  ${String(unmappedOwners).padStart(5)} owned by something that is neither a user nor a group`);
    }

    const [owned] = await app.query(
      `SELECT SUM(assigned_to IS NOT NULL) AS people_count,
              SUM(assigned_group_id IS NOT NULL) AS group_count,
              COUNT(*) AS total
         FROM customers`
    );
    console.log(
      `  ownership ${dryRun ? 'planned' : 'changed'}: ${dryRun ? peoplePlanned : peopleChanged} person(s), ${
        dryRun ? groupsPlanned : groupsChanged
      } group(s)` +
        (dryRun
          ? ''
          : ` - stored now: ${owned[0].people_count} people, ${owned[0].group_count} groups of ${owned[0].total} customers`)
    );
  }

  // ---------------------------------------------------------------- admins
  if (wants.admins) {
    const [vtigerAdmins] = await vtiger.query('SELECT id, is_admin FROM vtiger_users');
    const [appUsers] = await app.query(
      'SELECT id, name, vtiger_user_id, is_admin FROM users WHERE vtiger_user_id IS NOT NULL'
    );

    const flagByVtigerId = new Map(
      vtigerAdmins.map((row) => [String(row.id), ['on', '1', 'yes', 'y', 'true'].includes(String(row.is_admin ?? '').toLowerCase())])
    );

    console.log('\n=== Admins (vtiger_users.is_admin) ===');
    let promoted = 0;
    const adminNames = [];

    for (const user of appUsers) {
      const isAdmin = flagByVtigerId.get(String(user.vtiger_user_id)) ? 1 : 0;
      if (isAdmin) adminNames.push(user.name);
      if (Number(user.is_admin) === isAdmin) continue;
      promoted += 1;
      if (!dryRun) {
        await app.query('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin, user.id]);
      }
    }

    console.log(`  ${adminNames.length} admin(s) in Vtiger: ${adminNames.join(', ') || 'none'}`);
    console.log(`  ${promoted} flag(s) ${dryRun ? 'would change' : 'changed'} (the other ${appUsers.length - adminNames.length} stay non-admins)`);
  }

  // -------------------------------------------------------------- addresses
  if (wants.addresses) {
    const [billRows] = await vtiger.query(
      'SELECT accountaddressid, bill_street, bill_pobox, bill_city, bill_state, bill_code, bill_country FROM vtiger_accountbillads'
    );
    const [shipRows] = await vtiger.query(
      'SELECT accountaddressid, ship_street, ship_pobox, ship_city, ship_state, ship_code, ship_country FROM vtiger_accountshipads'
    );
    const billByVtigerId = new Map(billRows.map((row) => [String(row.accountaddressid), row]));
    const shipByVtigerId = new Map(shipRows.map((row) => [String(row.accountaddressid), row]));

    const toParts = (row, prefix) => ({
      street: clean(row[`${prefix}_street`]),
      locality: clean(row[`${prefix}_pobox`]),
      town: clean(row[`${prefix}_city`]),
      county: clean(row[`${prefix}_state`]),
      postcode: clean(row[`${prefix}_code`]),
      country: clean(row[`${prefix}_country`]),
    });

    const buildRow = (customerId, addressType, parts, isDefault) => {
      const address = parts.street ?? parts.locality ?? [parts.town, parts.postcode].filter(Boolean).join(', ');
      if (!address) return null;

      return [
        uuidv4(),
        customerId,
        addressType,
        truncate(address, 255),
        parts.street && parts.locality ? truncate(parts.locality, 255) : null,
        truncate(parts.town, 100),
        null, // city - Vtiger has no separate city value, only city/state/code
        truncate(parts.county, 100),
        truncate(parts.postcode, 20),
        truncate(parts.country, 100),
        isDefault ? 1 : 0,
        'VTIGER',
      ];
    };

    const insertRows = [];
    let billingRows = 0;
    let deliveryRows = 0;
    let noAddress = 0;

    for (const [vtigerId, customerId] of customerIdByVtigerId) {
      const bill = billByVtigerId.get(vtigerId);
      const ship = shipByVtigerId.get(vtigerId);

      const billing = bill ? buildRow(customerId, 'BILLING', toParts(bill, 'bill'), true) : null;
      if (billing) {
        insertRows.push(billing);
        billingRows += 1;
      }

      const delivery = ship ? buildRow(customerId, 'DELIVERY', toParts(ship, 'ship'), false) : null;
      if (delivery) {
        insertRows.push(delivery);
        deliveryRows += 1;
      }

      if (!billing && !delivery) noAddress += 1;
    }

    console.log('\n=== Addresses (vtiger_accountbillads / vtiger_accountshipads) ===');
    console.log(
      `  ${billingRows} billing row(s), ${deliveryRows} delivery row(s), ${noAddress} customer(s) with no address in Vtiger`
    );

    if (dryRun) {
      console.log('  DRY RUN - nothing written');
    } else {
      const [removed] = await app.query("DELETE FROM customer_addresses WHERE source = 'VTIGER'");
      console.log(`  removed ${removed.affectedRows} previously imported address row(s)`);

      let insertedRows = 0;
      for (const group of chunk(insertRows, 500)) {
        const [result] = await app.query(
          `INSERT INTO customer_addresses
             (id, customer_id, address_type, address, address_line2, town, city, county, postcode, country, is_default, source)
           VALUES ?`,
          [group]
        );
        insertedRows += result.affectedRows;
      }
      console.log(`  inserted ${insertedRows} address row(s)`);
    }
  }

  console.log(dryRun ? '\n✅ Dry run complete - nothing was written.' : '\n🎉 Backfill complete.');
} catch (err) {
  console.error('❌ Backfill failed:', err.message);
  process.exitCode = 1;
} finally {
  if (app) await app.end();
  if (vtiger) await vtiger.end();
}
