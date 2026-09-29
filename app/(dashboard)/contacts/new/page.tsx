import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactForm, type ContactFormValues } from '@/components/contact-form';
import { verifySession } from '@/lib/auth/dal';
import { getCustomerOption } from '@/lib/data/contacts';

export const metadata: Metadata = {
  title: 'New contact',
};

const EMPTY_CONTACT: ContactFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Create screen.
 *
 * A contact has to belong to a customer, so `?customer=<id>` pre-attaches the one the
 * form was opened from — which is how the customer's Contacts tab links here.
 */
export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string | string[] }>;
}) {
  await verifySession();

  const query = await searchParams;
  const customerId = firstValue(query.customer);
  const customer = customerId ? await getCustomerOption(customerId) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/contacts" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Back to contacts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          New contact
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the customer this contact belongs to, then fill in the rest. Only the last name is required.
        </p>
      </div>

      <ContactForm mode="create" values={EMPTY_CONTACT} customer={customer} />
    </div>
  );
}
