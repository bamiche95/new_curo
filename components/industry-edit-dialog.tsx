'use client';

import { Dialog } from '@/components/dialog';
import { IndustryForm, type IndustryFormValues } from '@/components/industry-form';
import type { IndustryRow } from '@/lib/data/types';

/**
 * Editing one industry, in a modal over the list.
 *
 * The values come straight from the row the table is showing, so the form always
 * opens on what the reader is looking at; a successful save closes the modal and
 * the revalidated list shows the new values behind it. Administrators only: the
 * row's Edit button is rendered for them alone, and the data layer re-checks the
 * flag for anything that arrives as a direct POST.
 */
export function IndustryEditDialog({
  industry,
  canManage,
  onClose,
}: {
  industry: IndustryRow;
  canManage: boolean;
  onClose: () => void;
}) {
  const values: IndustryFormValues = {
    code: industry.code,
    name: industry.name,
    sortOrder: String(industry.sort_order),
    isActive: industry.is_active === 1,
  };

  return (
    <Dialog
      title={`Edit ${industry.name}`}
      description="Used by the customers table's Industry picklist and the dashboard's Top industries panel."
      onClose={onClose}
    >
      <IndustryForm
        mode="edit"
        industryId={industry.id}
        values={values}
        canManage={canManage}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </Dialog>
  );
}