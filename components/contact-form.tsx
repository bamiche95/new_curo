'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { CustomerPicker } from '@/components/customer-picker';
import {
  createContactAction,
  updateContactAction,
  type ContactFormState,
} from '@/lib/contact-actions';
import type { ContactOption } from '@/lib/data/types';

const initialState: ContactFormState = {};

const labelClasses = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300';
const inputClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';
const errorInputClasses = 'border-red-400 dark:border-red-700';

/** The values the form starts from (a new contact, or the contact being edited). */
export type ContactFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

function getValue(name: string, values: ContactFormValues, state: ContactFormState): string {
  return state.values?.[name] ?? values[name as keyof ContactFormValues] ?? '';
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
  values: ContactFormValues;
  state: ContactFormState;
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

/**
 * Create/edit form for one contact.
 *
 * The same form serves both screens, so the fields, the validation feedback and the
 * attach picker can never drift apart. The customer a contact belongs to is chosen
 * with the searchable `CustomerPicker` (there are thousands of customers); the rest
 * are plain native inputs, so the form still works the way the customer form does.
 */
export function ContactForm({
  mode,
  contactId,
  values,
  customer,
}: {
  mode: 'create' | 'edit';
  contactId?: string;
  values: ContactFormValues;
  /** The attached customer (edit) or a pre-selected one (create). */
  customer: ContactOption | null;
}) {
  const formAction = mode === 'create' ? createContactAction : updateContactAction;
  const [state, action, pending] = useActionState<ContactFormState, FormData>(formAction, initialState);

  return (
    <form action={action} className="space-y-6">
      {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}

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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Contact</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClasses} htmlFor="customerId">
              Customer
              <span className="text-red-600 dark:text-red-400"> *</span>
            </label>
            <CustomerPicker initial={customer} invalid={state.field === 'customerId'} />
          </div>

          <Field name="firstName" label="First name" values={values} state={state} maxLength={100} />
          <Field name="lastName" label="Last name" values={values} state={state} maxLength={100} required />
          <Field name="email" label="Email" values={values} state={state} type="email" maxLength={255} autoComplete="email" />
          <Field name="phone" label="Phone" values={values} state={state} type="tel" maxLength={50} autoComplete="tel" />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? (mode === 'create' ? 'Creating…' : 'Saving…') : mode === 'create' ? 'Create contact' : 'Save changes'}
        </button>
        <Link
          href={contactId ? `/contacts/${contactId}` : '/contacts'}
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
