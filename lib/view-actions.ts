'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { parseCustomerQuery, queryHref } from '@/lib/customer-query';
import { deleteSavedView, makeDefaultView, saveSavedView } from '@/lib/data/saved-views';

export type ViewActionState = {
  error?: string;
  success?: string;
};

/** FormData keeps repeated keys, so collect them back into the table state shape. */
function formDataToParams(formData: FormData): Record<string, string[]> {
  const params: Record<string, string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    (params[key] ??= []).push(value);
  }
  return params;
}

export async function saveViewAction(previousState: ViewActionState, formData: FormData): Promise<ViewActionState> {
  const name = String(formData.get('viewName') ?? '').trim();
  const viewId = String(formData.get('viewId') ?? '') || null;

  if (!name) return { error: 'Give the view a name before saving.' };

  const state = parseCustomerQuery(formDataToParams(formData));

  try {
    const savedId = await saveSavedView({ id: viewId, name, state });
    revalidatePath('/customers');
    redirect(`/customers?view=${savedId}`);
  } catch (error) {
    // `redirect` throws a control-flow exception, so only real errors land here.
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('[views] save failed', error);
    return { error: error instanceof Error ? error.message : 'Could not save the view.' };
  }
}

export async function deleteViewAction(formData: FormData): Promise<void> {
  const viewId = String(formData.get('viewId') ?? '');
  if (viewId) {
    await deleteSavedView(viewId);
    revalidatePath('/customers');
  }
  redirect('/customers');
}

export async function makeDefaultViewAction(formData: FormData): Promise<void> {
  const viewId = String(formData.get('viewId') ?? '');
  const state = parseCustomerQuery(formDataToParams(formData));

  if (viewId) {
    await makeDefaultView(viewId);
    revalidatePath('/customers');
  }

  redirect(queryHref({ ...state, viewId: viewId || null }));
}
