'use client';

import { useState } from 'react';

import type { BaseColumnDef } from '@/lib/table-query';
import type { LookupOption } from '@/lib/data/types';

const controlClasses =
  'w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const chipClasses =
  'inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700';
const smallButtonClasses =
  'rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';

export type RangeFilter = { min?: number; max?: number };

/**
 * Text column filter: applied values render as chips (× removes one) and the
 * input adds another on Enter or blur. Hidden inputs carry the values into the
 * surrounding GET form, so Search applies them to the URL.
 */
function TextFilterField({
  columnKey,
  label,
  values,
}: {
  columnKey: string;
  label: string;
  values: string[];
}) {
  const [applied, setApplied] = useState<string[]>(values);
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!applied.includes(value)) setApplied([...applied, value]);
    setDraft('');
  };

  return (
    <div className="space-y-1">
      {applied.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {applied.map((value) => (
            <button
              key={value}
              type="button"
              title={`Remove ${value}`}
              className={chipClasses}
              onClick={() => setApplied(applied.filter((item) => item !== value))}
            >
              <span className="truncate">{value}</span>
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      ) : null}

      {applied.map((value) => (
        <input key={value} type="hidden" name={`f.${columnKey}`} value={value} />
      ))}

      <input
        name={`f.${columnKey}`}
        value={draft}
        placeholder="Search…"
        aria-label={`Filter ${label}`}
        className={controlClasses}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}


/** Lookup column filter: a compact dropdown of checkboxes (multi-value). */
function SelectFilterField({
  columnKey,
  label,
  values,
  options,
  includeNone,
  noneLabel = 'No value set',
}: {
  columnKey: string;
  label: string;
  values: string[];
  options: LookupOption[];
  includeNone: boolean;
  noneLabel?: string;
}) {
  const [applied, setApplied] = useState<string[]>(values);
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    setApplied((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  // People and groups come in as one list; show them as two sections.
  const sections = [
    { heading: 'Groups', items: options.filter((option) => option.kind === 'group') },
    { heading: 'People', items: options.filter((option) => option.kind === 'user') },
    { heading: null, items: options.filter((option) => !option.kind) },
  ].filter((section) => section.items.length > 0);

  const summary =
    applied.length === 0
      ? 'All'
      : applied.length === 1
        ? applied[0] === 'none'
          ? noneLabel
          : (options.find((option) => option.id === applied[0])?.name ?? '1 selected')
        : `${applied.length} selected`;

  return (
    <div className="relative">
      {applied.map((value) => (
        <input key={value} type="hidden" name={`f.${columnKey}`} value={value} />
      ))}

      <button
        type="button"
        aria-expanded={open}
        aria-label={`Filter ${label}`}
        className={`${controlClasses} flex items-center justify-between gap-1 text-left`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`truncate ${applied.length === 0 ? 'text-zinc-400 dark:text-zinc-500' : ''}`}>{summary}</span>
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {includeNone ? (
            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <input type="checkbox" checked={applied.includes('none')} onChange={() => toggle('none')} />
              <span className="italic text-zinc-500 dark:text-zinc-400">{noneLabel}</span>
            </label>
          ) : null}

          {sections.map((section) => (
            <div key={section.heading ?? 'all'}>
              {section.heading ? (
                <p className="px-1.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {section.heading}
                </p>
              ) : null}

              {section.items.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <input type="checkbox" checked={applied.includes(option.id)} onChange={() => toggle(option.id)} />
                  {option.colour ? (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                      style={{ backgroundColor: option.colour }}
                    />
                  ) : null}
                  <span className="truncate text-zinc-700 dark:text-zinc-200">{option.name}</span>
                </label>
              ))}
            </div>
          ))}

          <div className="mt-1 flex justify-between gap-2 border-t border-zinc-200 pt-1.5 dark:border-zinc-800">
            <button type="button" className={smallButtonClasses} onClick={() => setApplied([])}>
              Clear
            </button>
            <button type="button" className={smallButtonClasses} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Numeric column filter: an open-ended min/max range. */
function NumberFilterField({
  columnKey,
  label,
  range,
}: {
  columnKey: string;
  label: string;
  range: RangeFilter;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        name={`n.${columnKey}.min`}
        defaultValue={range.min ?? ''}
        inputMode="numeric"
        placeholder="Min"
        aria-label={`${label} minimum`}
        className={controlClasses}
      />
      <span aria-hidden className="text-zinc-400">
        –
      </span>
      <input
        name={`n.${columnKey}.max`}
        defaultValue={range.max ?? ''}
        inputMode="numeric"
        placeholder="Max"
        aria-label={`${label} maximum`}
        className={controlClasses}
      />
    </div>
  );
}

/**
 * The control shown in a column's filter cell.
 *
 * A `key` derived from the applied values re-initialises the field whenever the
 * URL state changes (after Search, Clear or opening a saved view), which avoids
 * any state-syncing effects.
 */
export function ColumnFilterField<K extends string>({
  column,
  values,
  range,
  options,
}: {
  column: BaseColumnDef<K>;
  values: string[];
  range: RangeFilter;
  options: LookupOption[];
}) {
  const stateKey = values.join('|');

  if (column.filter === 'text') {
    return <TextFilterField key={stateKey} columnKey={column.key} label={column.label} values={values} />;
  }

  if (column.filter === 'select') {
    return (
      <SelectFilterField
        key={stateKey}
        columnKey={column.key}
        label={column.label}
        values={values}
        options={options}
        includeNone={Boolean(column.emptyLabel)}
        noneLabel={column.emptyLabel}
      />
    );
  }

  return (
    <NumberFilterField
      key={`${range.min ?? ''}-${range.max ?? ''}`}
      columnKey={column.key}
      label={column.label}
      range={range}
    />
  );
}

/** Add and remove table columns. */
export function ColumnPicker<K extends string>({
  columns,
  visible,
  onToggle,
  onReset,
}: {
  columns: BaseColumnDef<K>[];
  visible: Record<string, boolean>;
  onToggle: (key: K, next: boolean) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {columns.map((column) => (
        <label
          key={column.key}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <input
            type="checkbox"
            checked={visible[column.key] ?? false}
            onChange={(event) => onToggle(column.key, event.target.checked)}
          />
          <span className="text-zinc-700 dark:text-zinc-200">{column.label}</span>
        </label>
      ))}
      <button type="button" className={`${smallButtonClasses} mt-2`} onClick={onReset}>
        Reset columns
      </button>
    </div>
  );
}

