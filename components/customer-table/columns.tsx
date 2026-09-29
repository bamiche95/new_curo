'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { IndustryBadge, StatusBadge } from '@/components/badges';
import { EditableCell } from '@/components/customer-table/editable-cell';
import type { ListTableFeatureSet } from '@/components/table/table-config';
import { CUSTOMER_COLUMNS, CELL_EDIT_LABELS, CELL_EDIT_VALUES, type CustomerColumnKey } from '@/lib/customer-query';
import type { CustomerTableRow, LookupOption } from '@/lib/data/types';
import { formatNumber } from '@/lib/format';


/**
 * Cell renderers, one per registry key.
 * The Account cell carries an `after:absolute after:inset-0` pseudo-element so the
 * whole row is clickable while remaining a single real link (keyboard, right-click
 * and open-in-new-tab all still work).
 */
/** Person or group, tagged so a group owner is never mistaken for one person. */
function AssigneeCell({ row }: { row: CustomerTableRow }) {
  if (row.assigned_to_name) {
    return <span className="text-zinc-700 dark:text-zinc-200">{row.assigned_to_name}</span>;
  }

  if (row.assigned_group_name) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="truncate text-zinc-700 dark:text-zinc-200">{row.assigned_group_name}</span>
        <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          group
        </span>
      </span>
    );
  }

  return <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>;
}

const CELLS: Record<CustomerColumnKey, (row: CustomerTableRow) => ReactNode> = {
  name: (row) => (
    <Link
      href={`/customers/${row.id}`}
      aria-label={`Open ${row.name}`}
      className="font-medium text-zinc-900 underline-offset-2 after:absolute after:inset-0 hover:underline dark:text-zinc-100"
    >
      {row.name}
    </Link>
  ),
  status: (row) => <StatusBadge name={row.status_name} colour={row.status_colour} />,
  industry: (row) => <IndustryBadge name={row.industry_name} />,
  assigned_to: (row) => <AssigneeCell row={row} />,
  address: (row) => row.address ?? '—',
  address_line2: (row) => row.address_line2 ?? '—',
  town: (row) => row.town ?? '—',
  city: (row) => row.city ?? '—',
  county: (row) => row.county ?? '—',
  postcode: (row) => row.postcode ?? '—',
  country: (row) => row.country ?? '—',
  email: (row) => row.email ?? '—',
  phone: (row) => row.phone ?? '—',
  communications: (row) => formatNumber(Number(row.communications)),
  vtiger: (row) => (row.vtiger === null ? '—' : String(row.vtiger)),
};

/** Where each registry column reads its value from on a table row. */
/**
 * Where each registry column reads its value from on a table row. Only the client
 * column model uses this — the server does the real filtering and sorting, and the
 * custom cell renderers decide what is displayed (`assigned_to` shows the person or
 * the group, whichever owns the customer).
 */
const ACCESSORS: Record<CustomerColumnKey, keyof CustomerTableRow> = {
  name: 'name',
  status: 'status_name',
  industry: 'industry_name',
  assigned_to: 'assigned_to_name',
  address: 'address',
  address_line2: 'address_line2',
  town: 'town',
  city: 'city',
  county: 'county',
  postcode: 'postcode',
  country: 'country',
  email: 'email',
  phone: 'phone',
  communications: 'communications',
  vtiger: 'vtiger',
};

/**
 * The inline-editor mappings live in `lib/customer-query.ts` (`CELL_EDIT_VALUES` /
 * `CELL_EDIT_LABELS`): the record page's Details tab is a Server Component, and a
 * Server Component cannot call a value exported from a `'use client'` module.
 */

/** Lookup lists the picklist editors and filters need (memoise — v9 wants stable inputs). */
export type CustomerCellOptions = {
  statuses: LookupOption[];
  industries: LookupOption[];
  owners: LookupOption[];
};

/**
 * Builds the column definitions, closing over the lookup options. Editable columns
 * (those with an `edit` block in the registry) render through `EditableCell`;
 * everything else behaves exactly as before.
 */
export function createCustomerColumns(
  options: CustomerCellOptions
): ColumnDef<ListTableFeatureSet, CustomerTableRow>[] {
  return CUSTOMER_COLUMNS.map((column) => ({
    id: column.key,
    accessorFn: (row: CustomerTableRow) => row[ACCESSORS[column.key]],
    header: column.label,
    cell: (context) => {
      const row = context.row.original;
      const display = CELLS[column.key](row);
      const { edit } = column;
      if (!edit) return display;

      return (
        <EditableCell
          customerId={row.id}
          column={column.key}
          label={column.label}
          edit={edit}
          emptyLabel={column.emptyLabel}
          value={CELL_EDIT_VALUES[column.key](row)}
          valueLabel={CELL_EDIT_LABELS[column.key](row)}
          display={display}
          options={
            edit.options === 'statuses'
              ? options.statuses
              : edit.options === 'industries'
                ? options.industries
                : edit.options === 'owners'
                  ? options.owners
                  : []
          }
        />
      );
    },
  }));
}
