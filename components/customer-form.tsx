'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from '@/lib/customer-actions';
import type { LookupOption } from '@/lib/data/types';

const initialState: CustomerFormState = {};

const labelClasses = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300';
const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const errorInputClasses = 'border-red-400 dark:border-red-700';

/** The values the form starts from (a new record, or the customer being edited). */
export type CustomerFormValues = {
  name: string;
  email: string;
  phone: string;
  statusId: string;
  industryId: string;
  owner: string;
  address: string;
  address_line2: string;
  town: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
};

function getValue(name: string, values: CustomerFormValues, state: CustomerFormState): string {
  return state.values?.[name] ?? values[name as keyof CustomerFormValues] ?? '';
}

function Field({
  name,
  label,
  values,
  state,
  type = 'text',
  maxLength,
  required,
  autoComplete,
}: {
  name: string;
  label: string;
  values: CustomerFormValues;
  state: CustomerFormState;
  type?: string;
  maxLength?: number;
  required?: boolean;
  autoComplete?: string;
}) {
  const invalid = state.field === name;

  return (
    <div>
      <label className={labelClasses} htmlFor={name}>
        {label}
        {required ? <span className="text-red-600 dark:text-red-400"> *</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={getValue(name, values, state)}
        maxLength={maxLength}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className={`${inputClasses} ${invalid ? errorInputClasses : ''}`}
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  values,
  state,
  options,
  emptyLabel,
  groups,
}: {
  name: string;
  label: string;
  values: CustomerFormValues;
  state: CustomerFormState;
  options: LookupOption[];
  emptyLabel: string;
  groups?: boolean;
}) {
  const invalid = state.field === name;
  const groupOptions = groups ? options.filter((option) => option.kind === 'group') : [];
  const peopleOptions = groups ? options.filter((option) => option.kind === 'user') : [];
  const plainOptions = groups ? [] : options;

  const renderOption = (option: LookupOption) => (
    <option key={option.id} value={option.kind ? `${option.kind}:${option.id}` : option.id}>
      {option.name}
    </option>
  );

  return (
    <div>
      <label className={labelClasses} htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={getValue(name, values, state)}
        aria-invalid={invalid || undefined}
        className={`${inputClasses} ${invalid ? errorInputClasses : ''}`}
      >
        <option value="">{emptyLabel}</option>
        {groupOptions.length > 0 ? <optgroup label="Groups">{groupOptions.map(renderOption)}</optgroup> : null}
        {peopleOptions.length > 0 ? <optgroup label="People">{peopleOptions.map(renderOption)}</optgroup> : null}
        {plainOptions.map(renderOption)}
      </select>
    </div>
  );
}

/**
 * The shared create/edit form.
 *
 * `mode` decides which Server Action runs and where the buttons point; everything
 * else — validation feedback, the picklists, the address block — is identical, so the
 * two screens can never drift apart. Account numbers are not part of this form: they
 * are internal bookkeeping and are generated in the data layer.
 */
export function CustomerForm({
  mode,
  customerId,
  values,
  statuses,
  industries,
  owners,
}: {
  mode: 'create' | 'edit';
  customerId?: string;
  values: CustomerFormValues;
  statuses: LookupOption[];
  industries: LookupOption[];
  owners: LookupOption[];
}) {
  const [state, formAction, pending] = useActionState<CustomerFormState, FormData>(
    mode === 'create' ? createCustomerAction : updateCustomerAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-6">
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Customer</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Account name" values={values} state={state} maxLength={255} required />
          <Field name="email" label="Email" values={values} state={state} type="email" maxLength={255} autoComplete="email" />
          <Field name="phone" label="Phone" values={values} state={state} type="tel" maxLength={50} autoComplete="tel" />
          <SelectField name="statusId" label="Status" values={values} state={state} options={statuses} emptyLabel="No status" />
          <SelectField name="industryId" label="Industry" values={values} state={state} options={industries} emptyLabel="No industry" />
          <SelectField name="owner" label="Assigned to" values={values} state={state} options={owners} emptyLabel="Unassigned" groups />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Primary address</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Leave these blank for a customer with no address. Address line is required as soon as you fill in any
          other part.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="address" label="Address line" values={values} state={state} maxLength={255} />
          <Field name="address_line2" label="Line 2" values={values} state={state} maxLength={255} />
          <Field name="town" label="Town" values={values} state={state} maxLength={100} />
          <Field name="city" label="City" values={values} state={state} maxLength={100} />
          <Field name="county" label="County" values={values} state={state} maxLength={100} />
          <Field name="postcode" label="Postcode" values={values} state={state} maxLength={20} />
          <Field name="country" label="Country" values={values} state={state} maxLength={100} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? (mode === 'create' ? 'Creating…' : 'Saving…') : mode === 'create' ? 'Create customer' : 'Save changes'}
        </button>
        <Link href={customerId ? `/customers/${customerId}` : '/customers'} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Cancel
        </Link>
      </div>
    </form>
  );
}
