'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import type { KeyboardEvent } from 'react';

import { addCommentAction, type CommentFormState } from '@/lib/customer-actions';
import { buildMentionOptions, mentionAt, type MentionOption } from '@/lib/mentions';
import type { ContactRow } from '@/lib/data/types';

const initialState: CommentFormState = {};

const textareaClasses =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-300 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-700';

const buttonClasses =
  'rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200';

const quietButtonClasses =
  'shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

const chipClasses =
  'inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';

/**
 * The comment composer: a textarea plus an `@` mention picker over the colleagues and
 * the customer's contacts.
 *
 * The tags are kept in step with the text: the hidden fields are derived from the
 * comment, so deleting an `@Name` also drops that tag instead of silently tagging
 * somebody the comment no longer mentions. The Server Action re-validates every tag
 * before anything is written.
 */
export function CommentForm({
  customerId,
  contacts,
  people,
  page,
}: {
  customerId: string;
  contacts: ContactRow[];
  people: { id: string; name: string }[];
  /** The page the timeline is on — a new comment makes page 1 the interesting one. */
  page: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CommentFormState, FormData>(
    addCommentAction,
    initialState
  );

  const options = buildMentionOptions(contacts, people);
  const [content, setContent] = useState(state.values?.content ?? '');
  const [tagged, setTagged] = useState<MentionOption[]>([]);
  const [caret, setCaret] = useState(0);
  /** Highlighted option, remembered against the query it belongs to. */
  const [highlight, setHighlight] = useState({ query: '', index: 0 });
  const [forced, setForced] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  /** The last action result the draft was cleared for, so it is cleared exactly once. */
  const [applied, setApplied] = useState<CommentFormState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const typed = mentionAt(content, caret);
  const open = forced || (typed !== null && typed.query !== dismissed);
  const query = typed?.query.toLowerCase() ?? '';
  const matches = options.filter(
    (option) =>
      query === '' ||
      option.name.toLowerCase().includes(query) ||
      (option.detail ?? '').toLowerCase().includes(query)
  );
  const active = highlight.query === query ? highlight.index : 0;
  const highlighted = matches[Math.min(active, Math.max(0, matches.length - 1))];

  /** A tag only survives while its `@Name` is still in the comment. */
  const submitted = tagged.filter((tag) => content.includes(`@${tag.name}`));

  const listId = `mention-list-${customerId}`;

  /**
   * Clearing the draft is a state adjustment during render rather than an effect: React
   * re-renders immediately, so the field, the chips and the picker reset together on the
   * one render that follows a saved comment. A rejected submit keeps the draft (the
   * action echoed it back, and this branch never runs).
   */
  if (state.success && applied !== state) {
    setApplied(state);
    setContent('');
    setTagged([]);
    setHighlight({ query: '', index: 0 });
    setDismissed(null);
    setForced(false);
  }

  // A saved comment is a new row at the top of page 1, so show that page.
  useEffect(() => {
    if (state.success && page > 1) router.replace(`/customers/${customerId}?tab=comments`);
  }, [state, page, customerId, router]);

  const insert = (option: MentionOption) => {
    const textarea = textareaRef.current;
    const at = textarea?.selectionStart ?? content.length;
    const mention = mentionAt(content, at);
    const start = mention ? mention.start : at;
    const next = `${content.slice(0, start)}@${option.name} ${content.slice(mention ? at : start)}`;
    const nextCaret = start + option.name.length + 2;

    setContent(next);
    setTagged((current) => (current.some((tag) => tag.value === option.value) ? current : [...current, option]));
    setForced(false);
    setDismissed(null);
    setHighlight({ query: '', index: 0 });

    // The textarea only carries the new text after the next paint; put the caret just
    // after the inserted name then, so typing carries on inside the comment.
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight({ query, index: matches.length === 0 ? 0 : (active + 1) % matches.length });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight({ query, index: matches.length === 0 ? 0 : (active - 1 + matches.length) % matches.length });
      return;
    }
    if (event.key === 'Escape') {
      setDismissed(typed ? typed.query : '');
      setForced(false);
      return;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && highlighted) {
      // With no `@` typed yet (the Tag button) Enter still means "new line".
      if (!typed && event.key === 'Enter') return;
      event.preventDefault();
      insert(highlighted);
    }
  };

  return (
    <form action={formAction} className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
      <input type="hidden" name="customerId" value={customerId} />
      {submitted.map((tag) => (
        <input key={tag.value} type="hidden" name="mentions" value={tag.value} />
      ))}

      <label htmlFor={`comment-${customerId}`} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Add a comment
      </label>

      <div
        className="relative"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-owns={open ? listId : undefined}
      >
        <textarea
          id={`comment-${customerId}`}
          ref={textareaRef}
          name="content"
          rows={3}
          value={content}
          disabled={pending}
          maxLength={4000}
          placeholder="Write an update… type @ to tag a colleague or a contact."
          aria-invalid={state.field === 'content' ? true : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={
            open && highlighted ? `mention-option-${customerId}-${highlighted.value}` : undefined
          }
          className={textareaClasses}
          onChange={(event) => {
            setContent(event.target.value);
            setCaret(event.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
          onClick={(event) => setCaret(event.currentTarget.selectionStart)}
        />

        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Tag a colleague or contact"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                {options.length === 0
                  ? 'No colleagues or contacts to tag yet.'
                  : 'No colleague or contact matches that.'}
              </li>
            ) : (
              matches.map((option, index) => (
                <li
                  key={option.value}
                  id={`mention-option-${customerId}-${option.value}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight({ query, index })}
                  onClick={() => insert(option)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                    index === active ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                  }`}
                >
                  <span className="text-zinc-900 dark:text-zinc-100">{option.name}</span>
                  <span className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {option.detail ? <span>{option.detail}</span> : null}
                    <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {option.kind === 'contact' ? 'Contact' : 'Person'}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || options.length === 0}
          onClick={() => {
            setForced(true);
            setDismissed(null);
            textareaRef.current?.focus();
          }}
          className={quietButtonClasses}
        >
          @ Tag person or contact
        </button>

        {submitted.map((tag) => (
          <span key={tag.value} className={chipClasses}>
            {tag.name}
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {tag.kind === 'contact' ? 'contact' : 'person'}
            </span>
            <button
              type="button"
              aria-label={`Remove ${tag.name}`}
              disabled={pending}
              onClick={() => setTagged((current) => current.filter((item) => item.value !== tag.value))}
              className="text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ✕
            </button>
          </span>
        ))}

        <span className="ml-auto flex items-center gap-3">
          <button type="submit" disabled={pending || content.trim() === ''} className={buttonClasses}>
            {pending ? 'Adding…' : 'Add comment'}
          </button>
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p aria-live="polite" className="mt-2 text-sm text-green-700 dark:text-green-400">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}



