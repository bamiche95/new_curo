/**
 * The customer data table: the column registry plus its URL ⇄ state mapping.
 *
 * The generic machinery (registry types, URL parsing, saved-view expansion) lives
 * in `lib/table-query.ts`; this module only describes the customers table and binds
 * that machinery to it. Every helper keeps the name the rest of the app imports.
 *
 * Deliberately free of `server-only` and database imports so that the client-side
 * table component and the server-side query builder stay in lockstep.
 */

import type { CustomerDetail, CustomerTableRow } from '@/lib/data/types';
import {
  createTableQuery,
  type BaseColumnDef,
  type BaseQueryState,
  type ColumnEdit,
} from '@/lib/table-query';

export type {
  CellUpdateResult,
  ColumnEdit,
  ColumnEditKind,
  ColumnFilterKind,
  RawParams,
} from '@/lib/table-query';

export const CUSTOMER_ENTITY = 'customers';

export type CustomerColumnEdit = ColumnEdit;

export type CustomerColumnKey =
  | 'name'
  | 'status'
  | 'industry'
  | 'assigned_to'
  | 'address'
  | 'address_line2'
  | 'town'
  | 'city'
  | 'county'
  | 'postcode'
  | 'country'
  | 'email'
  | 'phone'
  | 'communications'
  | 'vtiger';

export type CustomerColumnDef = BaseColumnDef<CustomerColumnKey>;

/**
 * Add or remove entries here and the whole table (columns, filters, picker) follows.
 *
 * `edit` turns a cell into an inline editor; a column without it stays read-only.
 * `town`/`county`/`postcode` are shown from the customer's default address, so
 * editing them writes to that address row (see `lib/data/customers.ts`).
 */
export const CUSTOMER_COLUMNS: CustomerColumnDef[] = [
  {
    key: 'name',
    label: 'Account',
    filter: 'text',
    defaultVisible: true,
    sortable: true,
    edit: { kind: 'text', required: true, maxLength: 255 },
  },
  {
    key: 'status',
    label: 'Status',
    filter: 'select',
    defaultVisible: true,
    sortable: true,
    emptyLabel: 'No status',
    edit: { kind: 'select', nullable: true, options: 'statuses' },
  },
  {
    key: 'industry',
    label: 'Industry',
    filter: 'select',
    defaultVisible: true,
    sortable: true,
    emptyLabel: 'No industry',
    edit: { kind: 'select', nullable: true, options: 'industries' },
  },
  {
    // Vtiger's owner: a person or a group, hence one combined cell.
    key: 'assigned_to',
    label: 'Assigned to',
    filter: 'select',
    defaultVisible: true,
    sortable: true,
    emptyLabel: 'Unassigned',
    edit: { kind: 'select', nullable: true, options: 'owners' },
  },
  {
    // The address columns all come from the customer's default address row, so
    // editing any of them writes to that same record (see lib/data/customers.ts).
    key: 'address',
    label: 'Address line',
    filter: 'text',
    defaultVisible: false,
    sortable: true,
    // The column is NOT NULL: a customer may have no address at all, but an
    // existing address row always keeps its street.
    edit: { kind: 'text', required: true, maxLength: 255 },
  },
  {
    key: 'address_line2',
    label: 'Line 2',
    filter: 'text',
    defaultVisible: false,
    sortable: true,
    edit: { kind: 'text', nullable: true, maxLength: 255 },
  },
  {
    key: 'town',
    label: 'Town',
    filter: 'text',
    defaultVisible: true,
    sortable: true,
    edit: { kind: 'text', nullable: true, maxLength: 100 },
  },
  {
    key: 'city',
    label: 'City',
    filter: 'text',
    defaultVisible: false,
    sortable: true,
    edit: { kind: 'text', nullable: true, maxLength: 100 },
  },
  {
    key: 'county',
    label: 'County',
    filter: 'text',
    defaultVisible: false,
    sortable: true,
    edit: { kind: 'text', nullable: true, maxLength: 100 },
  },
  {
    key: 'postcode',
    label: 'Postcode',
    filter: 'text',
    defaultVisible: true,
    sortable: true,
    edit: { kind: 'text', nullable: true, maxLength: 20 },
  },
  {
    key: 'country',
    label: 'Country',
    filter: 'text',
    defaultVisible: false,
    sortable: true,
    edit: { kind: 'text', nullable: true, maxLength: 100 },
  },
  {
    key: 'email',
    label: 'Email',
    filter: 'text',
    defaultVisible: true,
    sortable: true,
    edit: { kind: 'email', nullable: true, maxLength: 255 },
  },
  // Comms is `COUNT(*)` of the customer's communications — there is nothing to type into.
  { key: 'communications', label: 'Comms', filter: 'number', defaultVisible: true, sortable: true, align: 'right' },
  {
    key: 'phone',
    label: 'Phone',
    filter: 'text',
    defaultVisible: false,
    sortable: true,
    edit: { kind: 'tel', nullable: true, maxLength: 50 },
  },
  // Vtiger # is the legacy CRM's account id (UNIQUE) — read-only on purpose.
  { key: 'vtiger', label: 'Vtiger #', filter: 'number', defaultVisible: false, sortable: true, align: 'right' },
];

export const DEFAULT_SORT: CustomerColumnKey = 'name';

/** The table state, its URL mapping and its column whitelist, bound to this registry. */
const query = createTableQuery<CustomerColumnKey>({
  columns: CUSTOMER_COLUMNS,
  defaultSort: DEFAULT_SORT,
  basePath: '/customers',
});

export const DEFAULT_COLUMNS = query.defaultColumns;

export type CustomerQueryState = BaseQueryState<CustomerColumnKey>;

/** A column definition that is guaranteed to carry its `edit` block. */
export type EditableCustomerColumn = CustomerColumnDef & { edit: CustomerColumnEdit };

export const isColumnKey = query.isColumnKey;
export const columnDef = query.columnDef;
export const editableColumn = query.editableColumn;
export const parseCustomerQuery = query.parse;
export const toSearchParams = query.toSearchParams;
export const queryHref = query.queryHref;
export const isPristineQuery = query.isPristine;
export const activeFilterCount = query.activeFilterCount;
export const viewToState = query.viewToState;

export { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/table-query';

/**
 * The fields the inline editors read. Both the table's rows and the record page's
 * customer carry them, so one set of mappings serves both screens.
 *
 * These live here (and not beside the React components) because the Details tab is a
 * Server Component: importing a value from a `'use client'` module would hand it a
 * client reference instead of the function.
 */
export type EditableRowSource = CustomerTableRow | CustomerDetail;

/** The stored value behind each column, i.e. what an inline editor starts from. */
export const CELL_EDIT_VALUES: Record<CustomerColumnKey, (row: EditableRowSource) => string> = {
  name: (row) => row.name,
  status: (row) => row.status_id ?? '',
  industry: (row) => row.industry_id ?? '',
  // The owner editor carries the kind with the id, because a customer is owned by
  // either a person or a group.
  assigned_to: (row) =>
    row.assigned_to
      ? `user:${row.assigned_to}`
      : row.assigned_group_id
        ? `group:${row.assigned_group_id}`
        : '',
  address: (row) => row.address ?? '',
  address_line2: (row) => row.address_line2 ?? '',
  town: (row) => row.town ?? '',
  city: (row) => row.city ?? '',
  county: (row) => row.county ?? '',
  postcode: (row) => row.postcode ?? '',
  country: (row) => row.country ?? '',
  email: (row) => row.email ?? '',
  phone: (row) => row.phone ?? '',
  communications: () => '',
  vtiger: () => '',
};

/** The name behind a picklist value, used when that option is no longer active. */
export const CELL_EDIT_LABELS: Record<CustomerColumnKey, (row: EditableRowSource) => string | null> = {
  name: () => null,
  status: (row) => row.status_name,
  industry: (row) => row.industry_name,
  assigned_to: (row) => row.assigned_to_name ?? row.assigned_group_name,
  address: () => null,
  address_line2: () => null,
  town: () => null,
  city: () => null,
  county: () => null,
  postcode: () => null,
  country: () => null,
  email: () => null,
  phone: () => null,
  communications: () => null,
  vtiger: () => null,
};

