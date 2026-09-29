'use client';

import { useActionState, useEffect, useState } from 'react';

import { createStatusAction, updateStatusAction, type CustomerStatusFormState } from '@/lib/status-actions';

const initialState: CustomerStatusFormState = {};

const labelClasses = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300';
const hintClasses = 'mt-1 text-xs text-zinc-500 dark:text-zinc-400';
const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const errorInputClasses = 'border-red-400 dark:border-red-700';

const MAX_CODE_LENGTH = 50;
const MAX_NAME_LENGTH = 100;
/** The same check the data layer makes, so the preview only ever shows a real colour. */
const COLOUR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** `StatusBadge`'s own fallback, so the preview matches the badge on the customers table. */
const FALLBACK_COLOUR = '#a1a1aa';

/** The values the form starts from (a new status, or the one being edited). */
export type CustomerStatusFormValues = {
  code: string;
  name: string;
  colour: string;
  sortOrder: string;
  isActive: boolean;
};

function getValue(
  name: 'code' | 'name' | 'sortOrder',
  values: CustomerStatusFormValues,
  state: CustomerStatusFormState
): string {
  return state.values?.[name] ?? values[name] ?? '';
}

/**
 * Create/edit form for one customer status.
 *
 * One form serves both dialogs on the list, so the fields, the validation feedback
 * and the permission-dependent parts can never drift apart. `canManage` mirrors the
 * signed-in user's admin flag: everyone may add a status (code, name and colour),
 * while only an administrator sees — and may change — the sort order and the active
 * flag. The data layer enforces the same split for direct POSTs.
 *
 * The colour is the one controlled field, because the swatch beside it previews
 * what the badge will look like; blank means "no colour", which renders as the
 * badge's own grey.
 */
export function CustomerStatusForm({
  mode,
  statusId,
  values,
  canManage,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  statusId?: string;
  values: CustomerStatusFormValues;
  /** Administrators get the sort order and the active flag; everyone else does not. */
  canManage: boolean;
  /** Called once a save succeeded — the dialog closes itself with this. */
  onSuccess: () => void;
  /** The dialog's Cancel button. */
  onCancel: () => void;
}) {
  const formAction = mode === 'create' ? createStatusAction : updateStatusAction;
  const [state, action, pending] = useActionState<CustomerStatusFormState, FormData>(formAction, initialState);

  const [colour, setColour] = useState(values.colour);
  const validColour = COLOUR_PATTERN.test(colour.trim());

  // A cleared checkbox submits nothing at all, so the echo-back is 'on' or ''.
  const activeChecked = state.values ? state.values.isActive === 'on' : values.isActive;

  // A successful save is the dialog's cue to close; the list behind it has already
  // been refreshed by the action's revalidation.
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={action} className="space-y-6">
      {statusId ? <input type="hidden" name="statusId" value={statusId} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Status</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClasses} htmlFor="code">
              Code
              <span className="text-red-600 dark:text-red-400"> *</span>
            </label>
            <input
              id="code"
              name="code"
              type="text"
              defaultValue={getValue('code', values, state)}
              maxLength={MAX_CODE_LENGTH}
              required
              aria-invalid={state.field === 'code' || undefined}
              className={`${inputClasses} ${state.field === 'code' ? errorInputClasses : ''}`}
            />
            <p className={hintClasses}>
              A short, unique key — for example <span className="font-mono">NEW_BUSINESS</span>.
            </p>
          </div>

          <div>
            <label className={labelClasses} htmlFor="name">
              Name
              <span className="text-red-600 dark:text-red-400"> *</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={getValue('name', values, state)}
              maxLength={MAX_NAME_LENGTH}
              required
              aria-invalid={state.field === 'name' || undefined}
              className={`${inputClasses} ${state.field === 'name' ? errorInputClasses : ''}`}
            />
            <p className={hintClasses}>This is what the picklist shows.</p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClasses} htmlFor="colour">
              Colour
            </label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-9 w-9 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                style={{ backgroundColor: validColour ? colour.trim() : FALLBACK_COLOUR }}
              />
              <input
                id="colour"
                name="colour"
                type="text"
                value={colour}
                onChange={(event) => setColour(event.target.value)}
                maxLength={9}
                placeholder="#f59e0b"
                aria-invalid={state.field === 'colour' || undefined}
                className={`${inputClasses} mt-0 font-mono ${state.field === 'colour' ? errorInputClasses : ''}`}
              />
              <input
                type="color"
                aria-label="Pick the colour"
                value={validColour ? colour.trim().slice(0, 7) : FALLBACK_COLOUR}
                onChange={(event) => setColour(event.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <p className={hintClasses}>
              A hex colour such as <span className="font-mono">#f59e0b</span>, or blank for the default grey. The
              swatch is how the status badge will look on the customers table.
            </p>
          </div>

          {canManage ? (
            <>
              <div>
                <label className={labelClasses} htmlFor="sortOrder">
                  Sort order
                </label>
                <input
                  id="sortOrder"
                  name="sortOrder"
                  type="number"
                  step={1}
                  defaultValue={getValue('sortOrder', values, state)}
                  aria-invalid={state.field === 'sortOrder' || undefined}
                  className={`${inputClasses} ${state.field === 'sortOrder' ? errorInputClasses : ''}`}
                />
                <p className={hintClasses}>Lower numbers come first. Leave blank to put it at the end.</p>
              </div>

              <div className="sm:mt-6">
                <div className="flex items-start gap-2">
                  <input
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    defaultChecked={activeChecked}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                  />
                  <label className={labelClasses} htmlFor="isActive">
                    Active
                  </label>
                </div>
                <p className={`${hintClasses} ml-6`}>
                  Inactive statuses leave the picklist; the customers already holding one keep it.
                </p>
              </div>
            </>
          ) : (
            <p className={`${hintClasses} sm:col-span-2`}>
              New statuses are added at the end of the list and switched on. Only an administrator can reorder, rename,
              recolour, switch off or remove one.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Add status' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Cancel
        </button>
      </div>
    </form>
  );
}