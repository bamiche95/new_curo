'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ListTableFeatureSet } from '@/components/table/table-config';
import { CONTACT_COLUMNS, type ContactColumnKey } from '@/lib/contact-query';
import type { ContactTableRow } from '@/lib/data/types';
import { contactName } from '@/lib/mentions';

/**
 * Cell renderers, one per registry key.
 *
 * The Contact cell carries an `after:absolute after:inset-0` pseudo-element, so the
 * whole row opens the contact while remaining a single real link (keyboard,
 * right-click and open-in-new-tab all still work) — exactly like the customers
 * table. The Account cell is a second real link to the customer the contact is
 * attached to; `relative z-10` keeps it above the row-wide overlay.
 */
const CELLS: Record<ContactColumnKey, (row: ContactTableRow) => ReactNode> = {
  name: (row) => (
    <Link
      href={`/contacts/${row.id}`}
      aria-label={`Open ${contactName(row)}`}
      className="font-medium text-zinc-900 underline-offset-2 after:absolute after:inset-0 hover:underline dark:text-zinc-100"
    >
      {contactName(row)}
    </Link>
  ),
  account: (row) => (
    <Link
      href={`/customers/${row.customer_id}`}
      aria-label={`Open customer ${row.customer_name}`}
      className="relative z-10 text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
    >
      {row.customer_name}
    </Link>
  ),
  email: (row) => row.email ?? '—',
  phone: (row) => row.phone ?? '—',
  first_name: (row) => row.first_name ?? '—',
  last_name: (row) => row.last_name,
  account_no: (row) => row.customer_account_no,
  vtiger: (row) => (row.vtiger === null ? '—' : String(row.vtiger)),
};

/**
 * Where each registry column reads its value from. Only the client column model uses
 * this — the server does the real filtering and sorting — and `name` has no single
 * column (it is first + last), so it borrows the surname.
 */
const ACCESSORS: Record<ContactColumnKey, keyof ContactTableRow> = {
  name: 'last_name',
  account: 'customer_name',
  email: 'email',
  phone: 'phone',
  first_name: 'first_name',
  last_name: 'last_name',
  account_no: 'customer_account_no',
  vtiger: 'vtiger',
};

/**
 * The column definitions. Unlike the customers table this needs no lookups, so it is
 * built once at module scope — a stable reference is all TanStack Table v9 asks for.
 */
export const CONTACT_TABLE_COLUMNS: ColumnDef<ListTableFeatureSet, ContactTableRow>[] =
  CONTACT_COLUMNS.map((column) => ({
    id: column.key,
    accessorFn: (row: ContactTableRow) => row[ACCESSORS[column.key]],
    header: column.label,
    cell: (context) => CELLS[column.key](context.row.original),
  }));
