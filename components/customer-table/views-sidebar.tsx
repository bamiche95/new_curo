'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { toSearchParams, type CustomerQueryState } from '@/lib/customer-query';
import type { SavedViewRow } from '@/lib/data/types';
import { deleteViewAction, makeDefaultViewAction, saveViewAction, type ViewActionState } from '@/lib/view-actions';

const inputClasses =
  'w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const buttonClasses =
  'w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';

function itemClasses(active: boolean) {
  return `flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
    active
      ? 'bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
  }`;
}

/**
 * Saved views live here rather than above the table: the sidebar owns the full
 * height, scrolls on its own, and keeps the save/delete controls pinned at the
 * bottom. Table state still travels through the URL, so links are enough.
 */
export function ViewsSidebar({ views, state }: { views: SavedViewRow[]; state: CustomerQueryState }) {
  const activeView = views.find((view) => view.id === state.viewId) ?? null;
  const [name, setName] = useState(activeView?.name ?? '');
  const [result, saveAction, saving] = useActionState<ViewActionState, FormData>(saveViewAction, {});

  const hiddenParams = Array.from(toSearchParams({ ...state, page: 1 }).entries()).map(([key, value], index) => (
    <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
  ));

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="shrink-0 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Views</h2>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        <Link href="/customers" className={itemClasses(!state.viewId)}>
          <span className="truncate">Custom (unsaved)</span>
        </Link>

        {views.map((view) => (
          <Link
            key={view.id}
            href={`/customers?view=${view.id}`}
            className={itemClasses(view.id === state.viewId)}
          >
            <span className="truncate" title={view.name}>
              {view.name}
            </span>
            {view.is_default ? <span title="Default view">★</span> : null}
          </Link>
        ))}

        {views.length === 0 ? (
          <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            No saved views yet. Set your filters and columns, then name it below.
          </p>
        ) : null}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <form action={saveAction} className="space-y-2">
          {hiddenParams}
          <input type="hidden" name="viewId" value={state.viewId ?? ''} />
          <input
            name="viewName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this view…"
            aria-label="View name"
            className={inputClasses}
          />
          <button type="submit" className={buttonClasses} disabled={saving}>
            {activeView ? 'Save view' : 'Save as new'}
          </button>
        </form>

        {activeView ? (
          <div className="flex gap-2">
            <form action={makeDefaultViewAction} className="flex-1">
              {hiddenParams}
              <input type="hidden" name="viewId" value={activeView.id} />
              <button type="submit" className={buttonClasses} disabled={activeView.is_default === 1}>
                {activeView.is_default === 1 ? '★ Default' : 'Make default'}
              </button>
            </form>
            <form
              action={deleteViewAction}
              onSubmit={(event) => {
                if (!window.confirm(`Delete the view “${activeView.name}”?`)) event.preventDefault();
              }}
            >
              <input type="hidden" name="viewId" value={activeView.id} />
              <button
                type="submit"
                className={`${buttonClasses} w-auto px-3 text-red-600 dark:text-red-400`}
              >
                Delete
              </button>
            </form>
          </div>
        ) : null}

        {result.error ? <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p> : null}

        <Link href="/customers" className="block text-xs text-zinc-500 underline dark:text-zinc-400">
          Reset filters &amp; columns
        </Link>
      </div>
    </aside>
  );
}
