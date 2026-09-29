'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { updateCustomerCellAction } from '@/lib/customer-actions';
import type { CustomerColumnEdit, CustomerColumnKey } from '@/lib/customer-query';
import type { LookupOption } from '@/lib/data/types';

const editorClasses =
  'min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const iconButtonClasses =
  'shrink-0 rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M13.6 2.4a1.6 1.6 0 0 1 2.3 0l1.7 1.7a1.6 1.6 0 0 1 0 2.3l-9.2 9.2a1 1 0 0 1-.47.26l-3.2.83a.6.6 0 0 1-.73-.73l.83-3.2a1 1 0 0 1 .26-.47l9.2-9.2Z" />
    </svg>
  );
}

/**
 * One editable table cell: the value as the table renders it today, plus a pencil
 * that appears on hover (and on keyboard focus, and permanently on touch devices)
 * and swaps in a text field or a picklist.
 *
 * Commits go through a Server Action inside a transition, and the value on screen
 * is optimistic until the revalidated row arrives in the same response. Errors keep
 * the editor open with the draft intact; nothing is thrown across the wire.
 */
export function EditableCell({
  customerId,
  column,
  label,
  edit,
  value,
  valueLabel,
  emptyLabel,
  display,
  options,
}: {
  customerId: string;
  column: CustomerColumnKey;
  label: string;
  edit: CustomerColumnEdit;
  /** The stored value, `''` when the cell is empty. */
  value: string;
  /** Name behind the stored value, used when a picklist option was retired. */
  valueLabel: string | null;
  /** Label of the "clear this picklist" choice, e.g. "Unassigned". */
  emptyLabel?: string;
  display: ReactNode;
  options: LookupOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [pending, startTransition] = useTransition();
  const pencilRef = useRef<HTMLButtonElement | null>(null);
  const refocus = useRef(false);

  const editorId = `edit-${column}-${customerId}`;
  /** Owner options are prefixed (`user:`/`group:`); every other list is a plain id. */
  const optionValue = (option: LookupOption) => (option.kind ? `${option.kind}:${option.id}` : option.id);
  const groupOptions = options.filter((option) => option.kind === 'group');
  const peopleOptions = options.filter((option) => option.kind === 'user');
  const plainOptions = options.filter((option) => !option.kind);
  /** The stored id is not always in the active lookup list (a retired option). */
  const missingOption =
    edit.kind === 'select' && value !== '' && !options.some((option) => optionValue(option) === value);

  // Hand focus back to the pencil when the editor closes, so keyboard users are not dropped.
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      pencilRef.current?.focus();
    }
  }, [editing]);

  const open = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const close = () => {
    refocus.current = true;
    setDraft(value);
    setError(null);
    setEditing(false);
  };

  const commit = (submitted: string) => {
    if (submitted === value) {
      close();
      return;
    }

    startTransition(async () => {
      setOptimistic(submitted);
      const result = await updateCustomerCellAction({ customerId, column, value: submitted });

      if (result.ok) {
        setDraft(result.value ?? '');
        setError(null);
        refocus.current = true;
        setEditing(false);
      } else {
        setError(result.error);
      }
    });
  };

  /** Enter saves, Escape cancels — and Enter must never submit the surrounding search form. */
  const onEditorKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const showingOptimistic = optimistic !== value;
  const optimisticLabel =
    edit.kind === 'select'
      ? (options.find((option) => optionValue(option) === optimistic)?.name ?? optimistic)
      : optimistic;

  return (
    <div aria-busy={pending} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {showingOptimistic ? (
            <span className="text-zinc-500 dark:text-zinc-400">{optimisticLabel || '—'}</span>
          ) : (
            display
          )}
        </div>

        {editing ? null : (
          <button
            ref={pencilRef}
            type="button"
            title={`Edit ${label}`}
            aria-label={`Edit ${label}`}
            onClick={open}
            className="relative z-10 shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition hover:text-zinc-900 focus-visible:opacity-100 group-hover/cell:opacity-100 pointer-coarse:opacity-100 dark:text-zinc-500 dark:hover:text-zinc-50"
          >
            <PencilIcon />
          </button>
        )}
      </div>

      {editing ? (
        // `relative z-10`: keeps the editor clickable above the row-wide link overlay.
        <div className="relative z-10 flex items-center gap-1">
          <label htmlFor={editorId} className="sr-only">
            {label}
          </label>

          {edit.kind === 'select' ? (
            <select
              id={editorId}
              autoFocus
              disabled={pending}
              value={draft}
              aria-invalid={error ? true : undefined}
              onChange={(event) => commit(event.target.value)}
              onKeyDown={onEditorKeyDown}
              className={editorClasses}
            >
              <option value="">{emptyLabel ?? '— none —'}</option>
              {missingOption ? <option value={value}>{valueLabel ?? value}</option> : null}
              {groupOptions.length > 0 ? (
                <optgroup label="Groups">
                  {groupOptions.map((option) => (
                    <option key={option.id} value={optionValue(option)}>
                      {option.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {peopleOptions.length > 0 ? (
                <optgroup label="People">
                  {peopleOptions.map((option) => (
                    <option key={option.id} value={optionValue(option)}>
                      {option.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {plainOptions.map((option) => (
                <option key={option.id} value={optionValue(option)}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={editorId}
              autoFocus
              type={edit.kind}
              maxLength={edit.maxLength}
              value={draft}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onEditorKeyDown}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => (draft === value ? close() : commit(draft))}
              className={editorClasses}
            />
          )}

          {edit.kind === 'select' ? null : (
            <button
              type="button"
              title={`Save ${label}`}
              aria-label={`Save ${label}`}
              disabled={pending}
              // Keep focus in the field, otherwise blur commits before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(draft)}
              className={iconButtonClasses}
            >
              ✓
            </button>
          )}

          <button
            type="button"
            title="Cancel"
            aria-label={`Cancel editing ${label}`}
            disabled={pending}
            onMouseDown={(event) => event.preventDefault()}
            onClick={close}
            className={iconButtonClasses}
          >
            ✕
          </button>
        </div>
      ) : null}

      {pending ? <span className="text-xs text-zinc-400 dark:text-zinc-500">Saving…</span> : null}

      {error ? (
        <p role="alert" className="relative z-10 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
