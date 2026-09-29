/**
 * Seeds the lookup tables used by the customer screens.
 *
 *   npm run db:seed-lookups
 *
 * Rows are matched on their stable `code`, so:
 *   - re-running never duplicates or deletes anything;
 *   - `name` / `colour` / `sort_order` are refreshed from this file;
 *   - `is_active` is left untouched, so deactivating a value in the database sticks.
 */
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

import { loadEnv, newDbConfig } from './lib/load-env.mjs';

/**
 * Customer ID statuses.
 * Mirrors the Vtiger picklist `vtiger_cf_799` (values, order and colours).
 * `EX_CUSTOMER` is included because 49 migrated customers use it.
 */
const STATUSES = [
  ['NEW_BUSINESS', 'New Business', null],
  ['MARKETING_WIP', 'Marketing (W.I.P)', null],
  ['CUSTOMER', 'Customer', null],
  ['CUSTOMER_ONEOFF', 'Customer - one off', null],
  ['CONTRACTOR', 'Contractor', null],
  ['CLOSED', 'Closed', '#ffffff'],
  ['OPTED_OUT', 'Opted out', '#ffffff'],
  ['ARCHIVE', 'Archive', '#ffffff'],
  ['EX_CUSTOMER', 'ex-customer', '#ff0000'],
  ['BROKER', 'Broker', '#ffffff'],
  ['PRIVATE', 'Private', '#ffffff'],
  ['DISPOSAL_SITE', 'Disposal Site', '#ffffff'],
  ['IN_ADMINISTRATION', 'In Administration', '#ffffff'],
  ['EYAS', 'Eyas', '#ffffff'],
  ['LIQUIDATION', 'Liquidation', '#ffffff'],
  ['HAWKMET', 'Hawkmet', '#ffffff'],
  ['C_AND_R_LEWIS', 'C and R Lewis', '#ffffff'],
  // Not in the Vtiger picklist: used for customers whose stored status no longer
  // exists in it (they render as "????" in Vtiger).
  ['UNKNOWN', 'Unknown', '#cccccc'],
];

const INDUSTRIES = [
  ['WAREHOUSE_DISTRIBUTION_ONLY', 'Warehouse/distribution only'],
  ['SKIP_HIRE', 'Skip Hire'],
  ['AUTOMOTIVE', 'Automotive'],
  ['PLUMBER', 'Plumber'],
  ['FENCING_CONTRACTORS', 'Fencing Contractors'],
  ['ELECTRICIAN', 'Electrician'],
  ['AEROSPACE', 'Aerospace'],
  ['COMMERCIAL_PRINTER', 'Commercial Printer'],
  ['CUTTERS', 'Cutters'],
  ['COMMUNICATION', 'Communication'],
  ['COMPUTERS_HIGH_TECH', 'Computers/High Tech'],
  ['CONSTRUCTION', 'Construction'],
  ['DISTRIBUTION_WHOLESALE', 'Distribution/Wholesale'],
  ['ELECTRONICS', 'Electronics'],
  ['ENERGY_UTILITIES', 'Energy/Utilities'],
  ['ENGINEERING', 'Engineering'],
  ['LOGISTICS', 'Logistics'],
  ['MANUFACTURING', 'Manufacturing'],
  ['METAL_DEALERS', 'Metal Dealers'],
  ['PLASTIC_INJECTION_MOULDERS', 'Plastic Injection Moulders'],
  ['RECYCLING', 'Recycling'],
  ['SKIP_HIRE_RECYCLERS', 'Skip Hire/Recyclers'],
  ['STEEL_STOCKHOLDERS', 'Steel Stockholders'],
  ['GOVERNMENT', 'Government'],
  ['TRADERS', 'Traders'],
  ['TRANSPORTATION', 'Transportation'],
  ['WOOD_RECYCLER', 'Wood Recycler'],
  ['LAZER_CUTTINGS', 'Lazer cuttings'],
  ['FABRICATORS', 'Fabricators'],
  ['WELDING', 'Welding'],
  ['EQUIPMENT_SUPPLIER', 'Equipment supplier'],
  ['WASTE_MANAGEMENT', 'Waste Management'],
  ['REMOVE_OR_STORAGE', 'Remove or Storage'],
  ['DEMOLITION', 'Demolition'],
  ['FROZEN_FOOD_RETAILER', 'Frozen Food Retailer'],
  ['FIRE_PROTECTION_SERVICE', 'Fire Protection Service'],
  ['EVENT_LIGHTING_TECHNOLOGY', 'Event Lighting Technology'],
  ['COLLEGE', 'College'],
  ['PHARMACEUTICAL', 'Pharmaceutical'],
  // Not in your list, but used by migrated customers in Vtiger:
  ['POWDER_COATING', 'Powder Coating'],
  ['FOUNDRY', 'Foundry'],
  ['NHS', 'NHS'],
];

/** Quote types - target of quotes.quote_type_id. */
const QUOTE_TYPES = [
  ['WASTE_QUOTES', 'Waste Quotes', 'Waste and recycling collection quotes'],
  ['HAZARDOUS_QUOTE', 'Hazardous Quote', 'Hazardous / specialist waste quotes'],
  ['METAL_QUOTE', 'Metal Quote', 'Ferrous and non-ferrous metal quotes'],
];

loadEnv();

let conn;
try {
  conn = await mysql.createConnection(newDbConfig());
} catch (err) {
  console.error('❌ Could not connect to the database:', err.message);
  process.exit(1);
}

/**
 * Inserts or refreshes rows keyed on `code`.
 *
 * The insert/update split is decided by a cheap pre-check rather than
 * `affectedRows`, because mysql2 reports 1 both for a fresh insert and for an
 * existing row that it left untouched.
 */
async function upsert(table, insertColumns, updateColumns, rows, buildValues) {
  let inserted = 0;
  let refreshed = 0;
  let unchanged = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const values = buildValues(rows[index], index + 1);
    const code = values[1];

    const [existing] = await conn.query(`SELECT 1 FROM \`${table}\` WHERE code = ? LIMIT 1`, [code]);

    const placeholders = values.map(() => '?').join(', ');
    const updates = updateColumns.map((column) => `${column} = VALUES(${column})`).join(', ');

    const [result] = await conn.query(
      `INSERT INTO \`${table}\` (${insertColumns.join(', ')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      values
    );

    if (existing.length === 0) inserted += 1;
    else if (Number(result.changedRows ?? 0) > 0) refreshed += 1;
    else unchanged += 1;
  }

  return { inserted, refreshed, unchanged };
}

const describe = (result) => `${result.inserted} inserted, ${result.refreshed} refreshed, ${result.unchanged} unchanged`;

try {
  // `is_active` is deliberately excluded from the update list so a value you
  // deactivate in the database is not switched back on by a later seed run.
  const statusResult = await upsert(
    'customer_id_statuses',
    ['id', 'code', 'name', 'colour', 'sort_order', 'is_active'],
    ['name', 'colour', 'sort_order'],
    STATUSES,
    ([code, name, colour], sortOrder) => [uuidv4(), code, name, colour, sortOrder, 1]
  );
  console.log(`✅ customer_id_statuses: ${describe(statusResult)}`);

  const industryResult = await upsert(
    'industries',
    ['id', 'code', 'name', 'sort_order', 'is_active'],
    ['name', 'sort_order'],
    INDUSTRIES,
    ([code, name], sortOrder) => [uuidv4(), code, name, sortOrder, 1]
  );
  console.log(`✅ industries: ${describe(industryResult)}`);

  const quoteTypeResult = await upsert(
    'quote_types',
    ['id', 'code', 'name', 'description', 'sort_order', 'is_active'],
    ['name', 'description', 'sort_order'],
    QUOTE_TYPES,
    ([code, name, description], sortOrder) => [uuidv4(), code, name, description, sortOrder, 1]
  );
  console.log(`✅ quote_types: ${describe(quoteTypeResult)}`);

  const [statuses] = await conn.query(
    'SELECT code, name, colour, sort_order, is_active FROM customer_id_statuses ORDER BY sort_order'
  );
  console.log(`\n--- customer_id_statuses (${statuses.length}) ---`);
  for (const row of statuses) {
    console.log(`  ${String(row.sort_order).padStart(2)}. ${row.name}${row.colour ? ` [${row.colour}]` : ''}${row.is_active ? '' : ' (inactive)'}`);
  }

  const [industries] = await conn.query('SELECT code, name, sort_order, is_active FROM industries ORDER BY sort_order');
  console.log(`\n--- industries (${industries.length}) ---`);
  console.log('  ' + industries.map((row) => row.name + (row.is_active ? '' : ' (inactive)')).join(' · '));

  const [quoteTypes] = await conn.query('SELECT code, name, sort_order FROM quote_types ORDER BY sort_order');
  console.log(`\n--- quote_types (${quoteTypes.length}) ---`);
  console.log('  ' + quoteTypes.map((row) => row.name).join(' · '));

  console.log('\n🎉 Lookups seeded.');
} catch (err) {
  console.error('❌ Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}

