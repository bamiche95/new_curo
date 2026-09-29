'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { deleteCommentAction } from '@/lib/customer-actions';

/**
 * The author's own "Delete" affordance for one comment.
 *
 * Confirms with the same `window.confirm` the other destructive actions use, then calls
 * the Server Action inside a transition: the action revalidates the timeline, so the
 * refreshed row list arrives in the same round trip and no optimistic state is needed.
 * Errors stay on the row rather than throwing across the wire.
 */
export function CommentDeleteButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteCommentAction({ commentId });

      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="text-zinc-500 underline-offset-2 transition hover:text-red-600 hover:underline disabled:opacity-40 dark:text-zinc-400 dark:hover:text-red-400"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>

      {error ? (
        <span role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </>
  );
}
