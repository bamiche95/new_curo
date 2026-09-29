'use client';

import Form from 'next/form';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useTable, type RowSelectionState } from '@tanstack/react-table';

import { createCustomerColumns } from '@/components/customer-table/columns';
import { ColumnFilterField, ColumnPicker } from '@/components/table/filters';
import { listTableFeatures } from '@/components/table/table-config';
import { archiveCustomersAction } from '@/lib/customer-actions';
import {
  CUSTOMER_COLUMNS,
  DEFAULT_COLUMNS,
  PAGE_SIZES,
  activeFilterCount,
  columnDef,
  queryHref,
  type CustomerColumnKey,
  type CustomerQueryState,
} from '@/lib/customer-query';
import type { CustomerTableRow, LookupOption } from '@/lib/data/types';
import { formatNumber } from '@/lib/format';

const buttonClasses =
  'rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';
const controlClasses =
  'rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';

/** Stable empty value, so "nothing is selected" never creates a new object. */
const NO_SELECTION: RowSelectionState = {};

type Props = {
  rows: CustomerTableRow[];
  total: number;
  page: number;
  pageCount: number;
  state: CustomerQueryState;
  statuses: LookupOption[];
  industries: LookupOption[];
  owners: LookupOption[];
};

/**
 * The flexible customer table.
 *
 * TanStack Table v9 owns the column model (visible columns, ordering); the data,
 * filtering, sorting and paging all happen server-side in MySQL and are driven
 * entirely by the URL, so every view is shareable and survives a refresh.
 * Saved views live in the sibling `ViewsSidebar`.
 */
export function CustomerTable({ rows, total, page, pageCount, state, statuses, industries, owners }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openColumns, setOpenColumns] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, startArchive] = useTransition();

  /**
   * Selection belongs to one row set. The ids are stored together with a signature of
   * the rows they were chosen from, so a new page, search, view — or the re-render
   * after an archive — can never leave anything selected: TanStack keeps selected ids
   * even after the rows behind them are gone.
   */
  const rowSignature = rows.map((row) => row.id).join(',');
  const [selection, setSelection] = useState<{ signature: string; ids: RowSelectionState }>({
    signature: '',
    ids: NO_SELECTION,
  });
  const rowSelection = selection.signature === rowSignature ? selection.ids : NO_SELECTION;

  const visibility = useMemo(
    () =>
      Object.fromEntries(
        CUSTOMER_COLUMNS.map((column) => [column.key, state.cols.includes(column.key)])
      ) as Record<string, boolean>,
    [state.cols]
  );

  /**
   * The picklist editors need the lookup lists, so the column definitions are built
   * here and memoised — TanStack Table v9 expects a stable `columns` reference.
   */
  const columns = useMemo(
    () => createCustomerColumns({ statuses, industries, owners }),
    [statuses, industries, owners]
  );

  /** Every change re-runs the server query; the URL remains the source of truth. */
  const apply = (patch: Partial<CustomerQueryState>) => {
    const next: CustomerQueryState = { ...state, ...patch, page: patch.page ?? 1 };
    startTransition(() => router.push(queryHref(next), { scroll: false }));
  };

  const table = useTable({
    features: listTableFeatures,
    columns,
    data: rows,
    // Row ids are the customers' UUIDs, so a selection can never land on the wrong row.
    getRowId: (row) => row.id,
    enableRowSelection: true,
    state: { columnVisibility: visibility, rowSelection },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(visibility) : updater;
      const cols = CUSTOMER_COLUMNS.filter((column) => next[column.key]).map((column) => column.key);
      apply({ cols: cols.length > 0 ? cols : [...DEFAULT_COLUMNS] });
    },
    onRowSelectionChange: (updater) => {
      setSelection((current) => {
        const base = current.signature === rowSignature ? current.ids : NO_SELECTION;
        return { signature: rowSignature, ids: typeof updater === 'function' ? updater(base) : updater };
      });
    },
  });

  /** Only ids that are actually displayed are ever sent to the server. */
  const selectedIds = useMemo(
    () => rows.filter((row) => rowSelection[row.id]).map((row) => row.id),
    [rows, rowSelection]
  );

  /**
   * Archive = soft delete: the rows leave every view, but nothing is destroyed and
   * an administrator can restore or permanently delete them from /customers/archived.
   */
  const archiveSelected = () => {
    if (selectedIds.length === 0) return;

    const count = selectedIds.length;
    const confirmed = window.confirm(
      `Archive ${count} customer${count === 1 ? '' : 's'}?\n\n` +
        'They disappear from the table, the dashboard and the picklists. Nothing is deleted: ' +
        'an administrator can restore them, or delete them permanently, from the Archived customers page.'
    );
    if (!confirmed) return;

    setArchiveError(null);
    startArchive(async () => {
      const result = await archiveCustomersAction({ ids: selectedIds });
      if (!result.ok) setArchiveError(result.error);
    });
  };

  const filterCount = activeFilterCount(state);
  /**
   * Clear drops filters *and* the selected view (so a view's own filters don't
   * come straight back), while keeping your sort, columns and page size.
   */
  const clearHref = queryHref({ ...state, filters: {}, ranges: {}, page: 1, viewId: null });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {filterCount === 0 ? 'No filters' : `${filterCount} filtered column${filterCount === 1 ? '' : 's'}`}
          </span>

          <div className="relative">
            <button
              type="button"
              className={buttonClasses}
              aria-expanded={openColumns}
              onClick={() => setOpenColumns((open) => !open)}
            >
              Columns ({state.cols.length}/{CUSTOMER_COLUMNS.length})
            </button>
            {openColumns ? (
              <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <ColumnPicker
                  columns={CUSTOMER_COLUMNS}
                  visible={visibility}
                  onToggle={(key, next) => {
                    const cols = next
                      ? [...state.cols, key]
                      : state.cols.filter((item) => item !== key);
                    apply({ cols: cols.length > 0 ? cols : [...DEFAULT_COLUMNS] });
                  }}
                  onReset={() => apply({ cols: [...DEFAULT_COLUMNS] })}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/customers/new"
            className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            New customer
          </Link>

          {selectedIds.length > 0 ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedIds.length} selected
            </span>
          ) : null}

          <button
            type="button"
            onClick={archiveSelected}
            disabled={selectedIds.length === 0 || isArchiving}
            title={
              selectedIds.length === 0
                ? 'Select customers to archive'
                : `Archive ${selectedIds.length} customer${selectedIds.length === 1 ? '' : 's'}`
            }
            className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {isArchiving ? 'Archiving…' : 'Archive'}
          </button>

          {archiveError ? (
            <span role="alert" className="text-xs text-red-600 dark:text-red-400">
              {archiveError}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition dark:border-zinc-800 dark:bg-zinc-950 ${
          isPending ? 'opacity-60' : ''
        }`}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <Form action="/customers" scroll={false}>
            {/* Sort, columns, page size and the active view survive a search. */}
            <input type="hidden" name="sort" value={state.sort} />
            <input type="hidden" name="dir" value={state.dir} />
            <input type="hidden" name="cols" value={state.cols.join(',')} />
            <input type="hidden" name="size" value={state.size} />
            {state.viewId ? <input type="hidden" name="view" value={state.viewId} /> : null}

            <table className="w-full border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {/* Leading selection column: hand-rendered, because it is a control
                        rather than a data column (so the picker, saved views and the
                        filter row are untouched). */}
                    <th
                      scope="col"
                      className="sticky top-0 z-20 h-10 w-10 border-b border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <input
                        type="checkbox"
                        aria-label="Select all customers on this page"
                        title="Select all on this page"
                        checked={table.getIsAllPageRowsSelected()}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                        disabled={isArchiving}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </th>
                    {headerGroup.headers.map((header) => {
                      const key = header.column.id as CustomerColumnKey;
                      const definition = columnDef(key);
                      const sorted = state.sort === key;

                      return (
                        <th
                          key={header.id}
                          scope="col"
                          className={`sticky top-0 z-20 h-10 whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-4 font-medium dark:border-zinc-800 dark:bg-zinc-900 ${
                            definition.align === 'right' ? 'text-right' : ''
                          }`}
                        >
                        <div
                          className={`flex items-center gap-1.5 ${
                            definition.align === 'right' ? 'justify-end' : ''
                          }`}
                        >
                          <button
                            type="button"
                            title={`Sort by ${definition.label}`}
                            className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-50"
                            onClick={() => apply({ sort: key, dir: sorted && state.dir === 'asc' ? 'desc' : 'asc' })}
                          >
                            {definition.label}
                            {sorted ? <span aria-hidden>{state.dir === 'asc' ? '▲' : '▼'}</span> : null}
                          </button>
                        </div>

                      </th>
                    );
                  })}
                  <th className="sticky top-0 z-20 h-10 border-b border-zinc-200 bg-zinc-50 px-4 dark:border-zinc-800 dark:bg-zinc-900" />
                </tr>
              ))}

              <tr>
                <th className="sticky top-10 z-10 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900" />
                {table.getVisibleLeafColumns().map((column) => {
                  const key = column.id as CustomerColumnKey;
                  const definition = columnDef(key);

                  return (
                    <th
                      key={column.id}
                      className="sticky top-10 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-2 align-top font-normal normal-case dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <ColumnFilterField
                        column={definition}
                        values={state.filters[key] ?? []}
                        range={state.ranges[key] ?? {}}
                        options={
                          key === 'status'
                            ? statuses
                            : key === 'industry'
                              ? industries
                              : key === 'assigned_to'
                                ? owners
                                : []
                        }
                      />
                    </th>
                  );
                })}
                <th className="sticky top-10 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-2 align-top font-normal normal-case dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center gap-2">
                    <Link
                      href={clearHref}
                      className="whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Clear
                    </Link>
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Search
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={state.cols.length + 1} className="px-4 py-12 text-center text-zinc-500 dark:text-zinc-400">
                    No customers match these filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`relative cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
                      row.getIsSelected() ? 'bg-zinc-50 dark:bg-zinc-900/60' : ''
                    }`}
                  >
                    {/* `relative z-10` keeps the checkbox above the row-wide link overlay. */}
                    <td className="relative z-10 w-10 px-3 py-3 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.original.name}`}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        disabled={isArchiving}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    {row
                      .getAllCells()
                      .filter((cell) => cell.column.getIsVisible())
                      .map((cell) => (
                        // `group/cell` reveals the hover pencil. The cell is deliberately left
                        // unpositioned: the Account link's overlay is anchored to the row <tr>,
                        // which is what makes the whole row click-through.
                        <td
                          key={cell.id}
                          className={`group/cell px-4 py-3 text-zinc-600 dark:text-zinc-400 ${
                            columnDef(cell.column.id as CustomerColumnKey).align === 'right' ? 'text-right' : ''
                          }`}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
              </table>
            </Form>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 dark:text-zinc-400">Rows per page</span>
          <select
            aria-label="Rows per page"
            className={controlClasses}
            value={state.size}
            onChange={(event) => apply({ size: Number(event.target.value) })}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <span className="text-zinc-600 dark:text-zinc-400">
          {formatNumber(total)} customer{total === 1 ? '' : 's'} · page {page} of {pageCount}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClasses}
            disabled={page <= 1}
            onClick={() => apply({ page: page - 1 })}
          >
            Previous
          </button>
          <button
            type="button"
            className={buttonClasses}
            disabled={page >= pageCount}
            onClick={() => apply({ page: page + 1 })}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
