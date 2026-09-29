/**
 * The contacts data table: the column registry plus its URL ⇄ state mapping.
 *
 * Same registry-driven table as the customers screen (`lib/customer-query.ts`),
 * bound to the `contacts` table. Contacts are edited on their own add/edit form —
 * nothing here is inline-editable, so no column carries an `edit` block.
 */

import type { BaseColumnDef, BaseQueryState } from '@/lib/table-query';
import { createTableQuery } from '@/lib/table-query';

export type { RawParams } from '@/lib/table-query';


export const CONTACT_ENTITY = 'contacts';

export type ContactColumnKey =
  | 'name'
  | 'account'
  | 'email'
  | 'phone'
  | 'first_name'
  | 'last_name'
  | 'account_no'
  | 'vtiger';

export type ContactColumnDef = BaseColumnDef<ContactColumnKey>;

/**
 * Add or remove entries here and the whole table (columns, header filters, column
 * picker) follows. The SQL side lives in `lib/data/contacts.ts` (`SORT_SQL`,
 * `TEXT_FILTER_SQL`, `NUMERIC_FILTER_SQL`).
 *
 * `account` is the customer the contact is attached to — the header filter matches
 * the customer's name, and the cell links through to that customer.
 */
export const CONTACT_COLUMNS: ContactColumnDef[] = [
  // The contact's display name (first + last), and the column the row links through.
  { key: 'name', label: 'Contact', filter: 'text', defaultVisible: true, sortable: true },
  { key: 'account', label: 'Account', filter: 'text', defaultVisible: true, sortable: true },
  { key: 'email', label: 'Email', filter: 'text', defaultVisible: true, sortable: true },
  { key: 'phone', label: 'Phone', filter: 'text', defaultVisible: true, sortable: true },
  { key: 'first_name', label: 'First name', filter: 'text', defaultVisible: false, sortable: true },
  { key: 'last_name', label: 'Last name', filter: 'text', defaultVisible: false, sortable: true },
  { key: 'account_no', label: 'Account #', filter: 'text', defaultVisible: false, sortable: true },
  // Vtiger # is the legacy CRM's contact id (UNIQUE) — read-only on purpose.
  { key: 'vtiger', label: 'Vtiger #', filter: 'number', defaultVisible: false, sortable: true, align: 'right' },
];

export const DEFAULT_SORT: ContactColumnKey = 'name';

/** The table state, its URL mapping and its column whitelist, bound to this registry. */
const query = createTableQuery<ContactColumnKey>({
  columns: CONTACT_COLUMNS,
  defaultSort: DEFAULT_SORT,
  basePath: '/contacts',
});

export const DEFAULT_COLUMNS = query.defaultColumns;

export type ContactQueryState = BaseQueryState<ContactColumnKey>;

export const isColumnKey = query.isColumnKey;
export const columnDef = query.columnDef;
export const parseContactQuery = query.parse;
export const toSearchParams = query.toSearchParams;
export const queryHref = query.queryHref;
export const activeFilterCount = query.activeFilterCount;

export { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/table-query';
