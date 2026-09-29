import type { Metadata } from 'next';
import Link from 'next/link';

import { CustomerForm, type CustomerFormValues } from '@/components/customer-form';
import { verifySession } from '@/lib/auth/dal';
import { getLookupOptions } from '@/lib/data/customers';

export const metadata: Metadata = {
  title: 'New customer',
};

const EMPTY_CUSTOMER: CustomerFormValues = {
  name: '',
  email: '',
  phone: '',
  statusId: '',
  industryId: '',
  owner: '',
  address: '',
  address_line2: '',
  town: '',
  city: '',
  county: '',
  postcode: '',
  country: '',
};

/**
 * Create screen. Only the account name is required; the account number is internal
 * bookkeeping and is allocated in the data layer, so it is never asked for.
 */
export default async function NewCustomerPage() {
  await verifySession();
  const { statuses, industries, owners } = await getLookupOptions();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Back to customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          New customer
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Only the account name is required. Everything else can be filled in later, and the account number is
          allocated automatically.
        </p>
      </div>

      <CustomerForm
        mode="create"
        values={EMPTY_CUSTOMER}
        statuses={statuses}
        industries={industries}
        owners={owners}
      />
    </div>
  );
}
