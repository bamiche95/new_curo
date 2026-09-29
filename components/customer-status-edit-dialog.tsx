'use client';

import { Dialog } from '@/components/dialog';
import {
  CustomerStatusForm,
  type CustomerStatusFormValues,
} from '@/components/customer-status-form';
import type { CustomerStatusRow } from '@/lib/data/types';

/**
 * Editing one status, in a modal over the list.
 *
 * The values come straight from the row the table is showing, so the form always
 * opens on what the reader is looking at; a successful save closes the modal and
 * the revalidated list shows the new values behind it. Administrators only: the
 * row's Edit button is rendered for them alone, and the data layer re-checks the
 * flag for anything that arrives as a direct POST.
 */
export function CustomerStatusEditDialog({
  status,
  onClose,
}: {
  status: CustomerStatusRow;
  onClose: () => void;
}) {
  const values: CustomerStatusFormValues = {
    code: status.code,
    name: status.name,
    colour: status.colour ?? '',
    sortOrder: String(status.sort_order),
    isActive: status.is_active === 1,
  };

  return (
    <Dialog
      title={`Edit ${status.name}`}
      description="Used by the customers table's Status picklist and the dashboard's status breakdown."
      onClose={onClose}
    >
      <CustomerStatusForm
        mode="edit"
        statusId={status.id}
        values={values}
        canManage
        onSuccess={onClose}
        onCancel={onClose}
      />
    </Dialog>
  );
}