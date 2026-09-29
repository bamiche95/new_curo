import { Pill } from '@/components/badges';
import { CommentDeleteButton } from '@/components/customer-detail/comment-delete-button';
import { CommentForm } from '@/components/customer-detail/comment-form';
import { EmptyRow, Pager, SectionCard } from '@/components/customer-detail/section';
import { formatDateTime } from '@/lib/format';
import { escapeForMentionPattern } from '@/lib/mentions';
import type { CommunicationListItem, ContactRow, MentionRef, PagedResult } from '@/lib/data/types';

/**
 * The comment body with the people it tags highlighted. Only the *stored* tags are
 * matched, so `@Someone` that was never picked from the picker stays plain text.
 */
function highlightedContent(content: string, mentions: MentionRef[]) {
  if (mentions.length === 0) return content;

  const pattern = new RegExp(
    `@(${mentions.map((mention) => escapeForMentionPattern(mention.name)).join('|')})`,
    'g'
  );
  return content.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/** The comment timeline, with the composer above it. */
export function CommentsTab({
  customerId,
  communications,
  contacts,
  people,
  page,
  viewerId,
}: {
  customerId: string;
  communications: PagedResult<CommunicationListItem>;
  contacts: ContactRow[];
  people: { id: string; name: string }[];
  page: number;
  /** The signed-in user — they can delete the comments they wrote. */
  viewerId: string;
}) {
  return (
    <SectionCard title="Comments" count={communications.total}>
      <CommentForm customerId={customerId} contacts={contacts} people={people} page={page} />

      {communications.rows.length === 0 ? (
        <EmptyRow>No communications recorded.</EmptyRow>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {communications.rows.map((item) => (
            <li key={item.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Pill>{item.communication_type}</Pill>
                <span>{formatDateTime(item.created_at)}</span>
                {item.author_name ? <span>· {item.author_name}</span> : null}
                {item.author_id !== null && item.author_id === viewerId ? (
                  <span className="ml-auto flex items-center gap-2">
                    <CommentDeleteButton commentId={item.id} />
                  </span>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
                {highlightedContent(item.content, item.mentions)}
              </p>
              {item.mentions.length > 0 ? (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Tagged:</span>
                  {item.mentions.map((mention) => (
                    <span
                      key={`${mention.kind}:${mention.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {mention.name}
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {mention.kind === 'contact' ? 'contact' : 'person'}
                      </span>
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={communications.page}
        pageCount={communications.pageCount}
        hrefFor={(target) => `/customers/${customerId}?tab=comments&page=${target}`}
      />
    </SectionCard>
  );
}

