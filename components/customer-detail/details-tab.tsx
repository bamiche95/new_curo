import type { ReactNode } from 'react';

import { IndustryBadge, Pill, StatusBadge } from '@/components/badges';
import { EditableCell } from '@/components/customer-table/editable-cell';
import { EmptyRow, SectionCard } from '@/components/customer-detail/section';
import {
  CELL_EDIT_LABELS,
  CELL_EDIT_VALUES,
  columnDef,
  type CustomerColumnEdit,
  type CustomerColumnKey,
} from '@/lib/customer-query';
import type { AddressRow, CustomerDetail, LookupOption } from '@/lib/data/types';

type OptionLists = { statuses: LookupOption[]; industries: LookupOption[]; owners: LookupOption[] };

function optionsFor(edit: CustomerColumnEdit, lists: OptionLists): LookupOption[] {
  if (edit.options === 'statuses') return lists.statuses;
  if (edit.options === 'industries') return lists.industries;
  if (edit.options === 'owners') return lists.owners;
  return [];
}

/** How a field reads when it is not being edited. */
function display(column: CustomerColumnKey, customer: CustomerDetail): ReactNode {
  switch (column) {
    case 'status':
      return <StatusBadge name={customer.status_name} colour={customer.status_colour} />;
    case 'industry':
      return <IndustryBadge name={customer.industry_name} />;
    case 'assigned_to':
      if (customer.assigned_to_name) return customer.assigned_to_name;
      if (customer.assigned_group_name) {
        return (
          <span className="inline-flex items-center gap-1.5">
            <span>{customer.assigned_group_name}</span>
            <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              group
            </span>
          </span>
        );
      }
      return <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>;
    default: {
      const value = CELL_EDIT_VALUES[column](customer);
      return value === '' ? <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span> : value;
    }
  }
}

/** One labelled, inline-editable field (the same pencil + editor as the table). */
function EditableField({
  customer,
  column,
  lists,
}: {
  customer: CustomerDetail;
  column: CustomerColumnKey;
  lists: OptionLists;
}) {
  const definition = columnDef(column);
  const edit = definition.edit;
  if (!edit) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-900">
      <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{definition.label}</dt>
      <dd className="text-sm text-zinc-700 dark:text-zinc-200">
        <EditableCell
          customerId={customer.id}
          column={column}
          label={definition.label}
          edit={edit}
          emptyLabel={definition.emptyLabel}
          value={CELL_EDIT_VALUES[column](customer)}
          valueLabel={CELL_EDIT_LABELS[column](customer)}
          display={display(column, customer)}
          options={optionsFor(edit, lists)}
        />
      </dd>
    </div>
  );
}

const FIELD_GROUPS: { title: string; columns: CustomerColumnKey[] }[] = [
  { title: 'Customer', columns: ['name', 'status', 'industry', 'assigned_to', 'email', 'phone'] },
  {
    title: 'Primary address',
    columns: ['address', 'address_line2', 'town', 'city', 'county', 'postcode', 'country'],
  },
];

/** An address as one readable line. */
function addressLine(address: AddressRow): string {
  return (
    [
      address.address,
      address.address_line2,
      address.town,
      address.city,
      address.county,
      address.postcode,
      address.country,
    ]
      .filter(Boolean)
      .join(', ') || '—'
  );
}

/**
 * The Details tab: every customer field is editable in place (same pencil, same
 * Server Action and audit trail as the table), with the customer's addresses listed
 * underneath.
 */
export function DetailsTab({
  customer,
  addresses,
  statuses,
  industries,
  owners,
}: {
  customer: CustomerDetail;
  addresses: AddressRow[];
  statuses: LookupOption[];
  industries: LookupOption[];
  owners: LookupOption[];
}) {
  const lists: OptionLists = { statuses, industries, owners };

  return (
    <div className="space-y-4">
      {FIELD_GROUPS.map((group) => (
        <SectionCard key={group.title} title={group.title}>
          <dl className="grid gap-x-6 px-5 py-2 sm:grid-cols-2">
            {group.columns.map((column) => (
              <EditableField key={column} customer={customer} column={column} lists={lists} />
            ))}
          </dl>
          {group.title === 'Primary address' && !customer.address_id ? (
            <p className="px-5 pb-4 text-xs text-zinc-500 dark:text-zinc-400">
              This customer has no address yet — fill in Address line to create one.
            </p>
          ) : null}
        </SectionCard>
      ))}

      <SectionCard title="Addresses" count={addresses.length}>
        {addresses.length === 0 ? (
          <EmptyRow>No addresses recorded.</EmptyRow>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {addresses.map((address) => (
              <li key={address.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={address.address_type === 'BILLING' ? 'neutral' : 'warning'}>
                    {address.address_type}
                  </Pill>
                  {address.is_default ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default</span>
                  ) : null}
                  {address.source === 'VTIGER' ? (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">Imported</span>
                  ) : null}
                </div>
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">{addressLine(address)}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

