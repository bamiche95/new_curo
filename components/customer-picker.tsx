'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { searchCustomersAction } from '@/lib/contact-actions';
import type { ContactOption } from '@/lib/data/types';

const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const errorInputClasses = 'border-red-400 dark:border-red-700';
const chipButtonClasses =
  'shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

/**
 * The attach picker: which customer a contact belongs to.
 *
 * There are thousands of customers, so this is a search-as-you-type combobox backed
 * by a Server Action rather than a `<select>` holding every account. The chosen
 * customer still travels to the Server Action in a plain hidden `customerId` field,
 * so the form submits an ordinary value and the server re-checks that the customer
 * exists and is not archived.
 */
export function CustomerPicker({
  initial,
  invalid,
}: {
  /** The contact's current customer (edit screen), or `null` when creating one. */
  initial: ContactOption | null;
  /** Highlights the field when the server rejected it. */
  invalid?: boolean;
}) {
  const [selected, setSelected] = useState<ContactOption | null>(initial);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** Only the newest search may write its results, so a slow reply cannot win. */
  const requestId = useRef(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Debounced on-demand search. An empty term lists the first page of customers.
  // Every state update happens inside the timer/promise callback, never in the effect
  // body, so the effect only ever schedules work.
  useEffect(() => {
    if (!open || selected) return;

    const id = ++requestId.current;

    const timer = setTimeout(() => {
      setLoading(true);
      void searchCustomersAction(term)
        .then((results) => {
          if (id !== requestId.current) return;
          setOptions(results);
          setHighlight(0);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [term, open, selected]);

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const choose = (option: ContactOption) => {
    setSelected(option);
    setTerm('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, Math.max(0, options.length - 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const option = options[highlight];
      if (open && option) {
        // Enter picks a customer instead of submitting the half-filled form.
        event.preventDefault();
        choose(option);
      }
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      {/* The value the Server Action reads; the combobox only ever picks it. */}
      <input type="hidden" name="customerId" value={selected?.id ?? ''} />

      {selected ? (
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-50">
            {selected.name}
            <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">#{selected.account_no}</span>
          </span>
          <button
            type="button"
            className={chipButtonClasses}
            onClick={() => {
              setSelected(null);
              setOpen(true);
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <input
          id="customerId"
          value={term}
          placeholder="Search customers by name or account number…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="customer-picker-listbox"
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`${inputClasses} ${invalid ? errorInputClasses : ''}`}
        />
      )}

      {open && !selected ? (
        <ul
          id="customer-picker-listbox"
          role="listbox"
          aria-label="Matching customers"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {loading && options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Searching…</li>
          ) : null}

          {!loading && options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">No customer matches that.</li>
          ) : null}

          {options.map((option, index) => (
            <li
              key={option.id}
              role="option"
              aria-selected={index === highlight}
              // Keep focus in the input so the click lands before the list closes.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(option)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                index === highlight ? 'bg-zinc-100 dark:bg-zinc-800' : ''
              }`}
            >
              <span className="truncate text-zinc-900 dark:text-zinc-100">{option.name}</span>
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">#{option.account_no}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

