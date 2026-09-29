/**
 * Shared machinery for the registry-driven list tables (customers, contacts).
 *
 * A table is described by a column registry; everything else — the URL ⇄ state
 * mapping, the column whitelist used as the SQL guard, the sortable/filterable key
 * sets and the saved-view expansion — is derived from that registry here, so the
 * two tables cannot drift apart.
 *
 * Deliberately free of `server-only` and database imports so that the client-side
 * table components and the server-side query builders stay in lockstep.
 */

import type { SavedViewRow } from '@/lib/data/types';

export type ColumnFilterKind = 'text' | 'select' | 'number';

/** What a cell's inline editor is: a plain field or a lookup picklist. */
export type ColumnEditKind = 'text' | 'email' | 'tel' | 'select';

/**
 * Everything the inline cell editor and the server-side write path need to know
 * about one editable column. The constraints live here so the editor's input
 * attributes and the SQL guards can never drift apart.
 */
export type ColumnEdit = {
  kind: ColumnEditKind;
  /** Blank input is rejected (name, account no.). */
  required?: boolean;
  /** Blank input is stored as NULL (email, phone, town, …). */
  nullable?: boolean;
  maxLength?: number;
  /** Entity-specific lookup list that fills a select editor, e.g. `statuses`. */
  options?: string;
};

export type BaseColumnDef<K extends string = string> = {
  key: K;
  label: string;
  filter: ColumnFilterKind;
  defaultVisible: boolean;
  sortable: boolean;
  align?: 'left' | 'right';
  /** Present when the cell can be edited in place. */
  edit?: ColumnEdit;
  /**
   * Label of the "no value" choice, e.g. "Unassigned". Used both by the picklist
   * editor and by the filter's `none` option, so the two can never disagree.
   */
  emptyLabel?: string;
};

export type BaseQueryState<K extends string = string> = {
  /** Multi-value filters keyed by column; values within a column are OR'd. */
  filters: Record<string, string[]>;
  /** Min/max ranges for numeric columns. */
  ranges: Record<string, { min?: number; max?: number }>;
  sort: K;
  dir: 'asc' | 'desc';
  cols: K[];
  page: number;
  size: number;
  viewId: string | null;
};

export type RawParams = Record<string, string | string[] | undefined>;

/** Outcome of one inline cell edit, shared by the Server Action and the cell UI. */
export type CellUpdateResult = { ok: true; value: string | null } | { ok: false; error: string };

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

const FILTER_PREFIX = 'f.';
const RANGE_PREFIX = 'n.';

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Everything one registry contributes to its table and to the SQL layer. */
export type TableQuery<K extends string> = {
  columns: BaseColumnDef<K>[];
  defaultColumns: K[];
  defaultSort: K;
  isColumnKey(value: string): value is K;
  columnDef(key: K): BaseColumnDef<K>;
  /** The definition of an editable column, or `undefined` when the cell is read-only. */
  editableColumn(key: string): (BaseColumnDef<K> & { edit: ColumnEdit }) | undefined;
  parse(params: RawParams): BaseQueryState<K>;
  toSearchParams(state: BaseQueryState<K>): URLSearchParams;
  queryHref(state: BaseQueryState<K>): string;
  isPristine(params: RawParams): boolean;
  activeFilterCount(state: BaseQueryState<K>): number;
  viewToState(view: SavedViewRow, base: BaseQueryState<K>, params?: RawParams): BaseQueryState<K>;
};

/**
 * Builds the URL ⇄ state helpers for one table registry.
 *
 * `basePath` is where `queryHref` points (e.g. `/customers`); `defaultSort` is the
 * column the table opens on and the one the URL may omit.
 */
export function createTableQuery<K extends string>(config: {
  columns: BaseColumnDef<K>[];
  defaultSort: K;
  basePath: string;
}): TableQuery<K> {
  const { columns, defaultSort, basePath } = config;

  const defaultColumns = columns.filter((column) => column.defaultVisible).map((column) => column.key);
  const columnKeys = new Set<string>(columns.map((column) => column.key));
  const sortableKeys = new Set<string>(
    columns.filter((column) => column.sortable).map((column) => column.key)
  );
  const editableColumns = new Map<string, BaseColumnDef<K>>(
    columns.filter((column) => column.edit).map((column) => [column.key, column])
  );

  function isColumnKey(value: string): value is K {
    return columnKeys.has(value);
  }

  function columnDef(key: K): BaseColumnDef<K> {
    const found = columns.find((column) => column.key === key);
    if (!found) throw new Error(`Unknown table column: ${key}`);
    return found;
  }

  /**
   * The server uses this as the whitelist, so an unknown key can never reach SQL.
   */
  function editableColumn(key: string): (BaseColumnDef<K> & { edit: ColumnEdit }) | undefined {
    return editableColumns.get(key) as (BaseColumnDef<K> & { edit: ColumnEdit }) | undefined;
  }

  /** Parses URL search params (or FormData-style params) into table state. */
  function parse(params: RawParams): BaseQueryState<K> {
    const filters: Record<string, string[]> = {};
    const ranges: Record<string, { min?: number; max?: number }> = {};

    for (const [rawKey, rawValue] of Object.entries(params)) {
      if (rawKey.startsWith(FILTER_PREFIX)) {
        const key = rawKey.slice(FILTER_PREFIX.length);
        if (!isColumnKey(key)) continue;
        const values = toArray(rawValue)
          .map((value) => value.trim())
          .filter((value) => value !== '');
        if (values.length > 0) filters[key] = Array.from(new Set(values));
        continue;
      }

      if (rawKey.startsWith(RANGE_PREFIX)) {
        const parts = rawKey.split('.');
        const key = parts[1];
        const bound = parts[2];
        if ((bound !== 'min' && bound !== 'max') || !key || !isColumnKey(key)) continue;
        const parsed = Number(toArray(rawValue)[0]);
        if (!Number.isFinite(parsed)) continue;
        ranges[key] = { ...ranges[key], [bound]: parsed };
      }
    }

    const sortParam = toArray(params.sort)[0] ?? '';
    const sort: K = sortableKeys.has(sortParam) && isColumnKey(sortParam) ? sortParam : defaultSort;
    const dir: 'asc' | 'desc' = toArray(params.dir)[0] === 'desc' ? 'desc' : 'asc';

    const colsParam = toArray(params.cols)[0];
    const requestedCols = (colsParam ? colsParam.split(',') : []).filter(isColumnKey);
    const cols = requestedCols.length > 0 ? Array.from(new Set(requestedCols)) : [...defaultColumns];

    const pageParam = Number.parseInt(toArray(params.page)[0] ?? '', 10);
    const sizeParam = Number.parseInt(toArray(params.size)[0] ?? '', 10);

    return {
      filters,
      ranges,
      sort,
      dir,
      cols,
      page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1,
      size: (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE,
      viewId: toArray(params.view)[0] || null,
    };
  }

  /** Serialises table state back into URL search params, omitting defaults. */
  function toSearchParams(state: BaseQueryState<K>): URLSearchParams {
    const params = new URLSearchParams();

    for (const [key, values] of Object.entries(state.filters)) {
      for (const value of values) params.append(`${FILTER_PREFIX}${key}`, value);
    }

    for (const [key, range] of Object.entries(state.ranges)) {
      if (range.min !== undefined) params.set(`${RANGE_PREFIX}${key}.min`, String(range.min));
      if (range.max !== undefined) params.set(`${RANGE_PREFIX}${key}.max`, String(range.max));
    }

    // With a view open the URL has to pin the sort even when it is the app default.
    // An omitted `sort`/`dir` means "let the view decide", which made a view that
    // stored `name DESC` impossible to flip back to A-Z: the click was dropped and
    // the view's descending sort came straight back.
    const pinSort = state.viewId !== null;
    if (pinSort || state.sort !== defaultSort) params.set('sort', state.sort);
    if (pinSort || state.dir !== 'asc') params.set('dir', state.dir);
    if (state.cols.join(',') !== defaultColumns.join(',')) params.set('cols', state.cols.join(','));
    if (state.page > 1) params.set('page', String(state.page));
    if (state.size !== DEFAULT_PAGE_SIZE) params.set('size', String(state.size));
    if (state.viewId) params.set('view', state.viewId);

    return params;
  }

  function queryHref(state: BaseQueryState<K>): string {
    const query = toSearchParams(state).toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  /** True when the URL carries no filters, sort or column selection. */
  function isPristine(params: RawParams): boolean {
    const hasFilters = Object.keys(params).some(
      (key) => key.startsWith(FILTER_PREFIX) || key.startsWith(RANGE_PREFIX)
    );
    return !hasFilters && ['sort', 'dir', 'cols'].every((key) => params[key] === undefined);
  }

  function activeFilterCount(state: BaseQueryState<K>): number {
    return Object.keys(state.filters).length + Object.keys(state.ranges).length;
  }

  /**
   * Turns a stored saved-view row into concrete table state.
   *
   * The URL always wins: anything the URL actually carries (filters, sort, columns,
   * page size) is kept and the view only fills in what the URL leaves out. `page` is
   * never reset here — doing so made paging through a default view bounce back to
   * page 1, so Next/Previous appeared dead.
   */
  function viewToState(
    view: SavedViewRow,
    base: BaseQueryState<K>,
    params: RawParams = {}
  ): BaseQueryState<K> {
    const has = (key: string) => params[key] !== undefined;
    const hasFilters = Object.keys(params).some((key) => key.startsWith('f.') || key.startsWith('n.'));
    const viewCols = view.columns.filter(isColumnKey);
    const viewSortKey =
      view.sort && sortableKeys.has(view.sort.key) && isColumnKey(view.sort.key) ? view.sort.key : null;

    return {
      ...base,
      // A searched filter must beat the view's stored filters, otherwise Search looks broken.
      filters: hasFilters ? base.filters : view.filters,
      ranges: hasFilters ? base.ranges : view.ranges,
      cols: has('cols') ? base.cols : viewCols.length > 0 ? viewCols : base.cols,
      sort: has('sort') ? base.sort : (viewSortKey ?? base.sort),
      dir: has('dir') ? base.dir : view.sort ? (view.sort.dir === 'desc' ? 'desc' : 'asc') : base.dir,
      size: has('size')
        ? base.size
        : (PAGE_SIZES as readonly number[]).includes(view.page_size)
          ? view.page_size
          : base.size,
      page: base.page,
      viewId: view.id,
    };
  }

  return {
    columns,
    defaultColumns,
    defaultSort,
    isColumnKey,
    columnDef,
    editableColumn,
    parse,
    toSearchParams,
    queryHref,
    isPristine,
    activeFilterCount,
    viewToState,
  };
}

