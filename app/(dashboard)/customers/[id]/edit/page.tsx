import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CustomerForm, type CustomerFormValues } from '@/components/customer-form';
import { verifySession } from '@/lib/auth/dal';
import { getCustomer, getLookupOptions } from '@/lib/data/customers';

export const metadata: Metadata = {
  title: 'Edit customer',
};

/**
 * Edit screen: the same form as the create screen, pre-filled from the customer and
 * its primary address. Archived customers are not editable — an administrator has to
 * restore them first — so this 404s for them, exactly like a missing record.
 */
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const customer = await getCustomer(id);
  if (!customer || customer.deleted_at) notFound();

  await verifySession();
  const { statuses, industries, owners } = await getLookupOptions();

  const values: CustomerFormValues = {
    name: customer.name,
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    statusId: customer.status_id ?? '',
    industryId: customer.industry_id ?? '',
    owner: customer.assigned_to
      ? `user:${customer.assigned_to}`
      : customer.assigned_group_id
        ? `group:${customer.assigned_group_id}`
        : '',
    address: customer.address ?? '',
    address_line2: customer.address_line2 ?? '',
    town: customer.town ?? '',
    city: customer.city ?? '',
    county: customer.county ?? '',
    postcode: customer.postcode ?? '',
    country: customer.country ?? '',
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/customers/${customer.id}`} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Back to {customer.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit customer
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every change is recorded on the customer&apos;s Updates tab.
        </p>
      </div>

      <CustomerForm
        mode="edit"
        customerId={customer.id}
        values={values}
        statuses={statuses}
        industries={industries}
        owners={owners}
      />
    </div>
  );
}
