import {
  columnOrderingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  tableFeatures,
} from '@tanstack/react-table';

/**
 * TanStack Table v9 registers optional features explicitly.
 *
 * Filtering, sorting and paging are executed by MySQL, so the shared registry-driven
 * list tables (customers, contacts) only need column visibility (add/remove columns),
 * ordering, and row selection (the customers table's bulk archive checkbox column —
 * inert on tables that do not enable it).
 */
export const listTableFeatures = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  rowSelectionFeature,
});

export type ListTableFeatureSet = typeof listTableFeatures;
