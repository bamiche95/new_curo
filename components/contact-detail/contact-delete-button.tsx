'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { deleteContactAction } from '@/lib/contact-actions';

/**
 * The destructive "Delete contact" affordance on the edit screen.
 *
 * Confirms with the same `window.confirm` the other destructive actions use, then
 * calls the Server Action inside a transition: it revalidates the table and the
 * customer's trail, and on success the contact is gone, so we go back to the list.
 * Errors stay on the button rather than throwing across the wire.
 */
export function ContactDeleteButton({ contactId, name }: { contactId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteContactAction({ contactId });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push('/contacts');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
      >
        {pending ? 'Deleting…' : 'Delete contact'}
      </button>

      {error ? (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
