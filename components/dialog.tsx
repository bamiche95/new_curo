'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A modal built on the native `<dialog>` element.
 *
 * Render it only while it should be on screen: on mount it opens itself with
 * `showModal()`, which lifts it into the top layer (the dashboard's scrollable
 * `<main>` would clip a hand-rolled overlay), traps focus and closes on Escape.
 * Escape and a backdrop click both report through `onClose`, so the caller
 * unmounts it the one way. The close button is deliberately last in the DOM:
 * `showModal()` focuses the first focusable element, which is then the content's
 * own first field or button rather than the ✕.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A backdrop click targets the dialog element itself; the content sits in
      // its own padded box, so a click inside it never reaches this handler.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 backdrop:bg-black/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
    >
      <div className="relative p-5">
        <h2 id={titleId} className="pr-10 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p> : null}

        <div className="mt-5">{children}</div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>
    </dialog>
  );
}