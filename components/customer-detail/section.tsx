import type { ReactNode } from 'react';

import { Pill } from '@/components/badges';
import { daysUntil, formatDate, formatNumber } from '@/lib/format';

/** Colours for the quote status pills. */
export const QUOTE_TONES: Record<string, 'neutral' | 'positive' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  SENT: 'warning',
  PENDING: 'warning',
  ACCEPTED: 'positive',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

/** Colours for the activity action pills. */
export const ACTIVITY_TONES: Record<string, 'neutral' | 'positive' | 'warning' | 'danger'> = {
  CREATED: 'positive',
  UPDATED: 'warning',
  DELETED: 'danger',
  STATUS_CHANGED: 'warning',
  INDUSTRY_CHANGED: 'warning',
  ADDRESS_CHANGED: 'warning',
  DOCUMENT_ADDED: 'neutral',
  COMMENT_ADDED: 'neutral',
  COMMENT_DELETED: 'danger',
  QUOTE_CREATED: 'neutral',
  // Contact events are written against the customer the contact belongs to.
  CONTACT_CREATED: 'positive',
  CONTACT_UPDATED: 'warning',
  CONTACT_MOVED: 'warning',
  CONTACT_DELETED: 'danger',
};

/** The card every tab renders its content into. */
export function SectionCard({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
          {count === undefined ? null : (
            <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">({formatNumber(count)})</span>
          )}
        </h2>
      </div>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>;
}

/** Newer/Older pager shared by the paginated tabs (Updates, Comments). */
export function Pager({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  const linkClasses = (disabled: boolean) =>
    disabled ? 'pointer-events-none text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 underline dark:text-zinc-200';

  return (
    <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-sm dark:border-zinc-800">
      <a href={hrefFor(Math.max(1, page - 1))} className={linkClasses(page <= 1)}>
        Newer
      </a>
      <span className="text-zinc-600 dark:text-zinc-400">
        Page {page} of {pageCount}
      </span>
      <a href={hrefFor(Math.min(pageCount, page + 1))} className={linkClasses(page >= pageCount)}>
        Older
      </a>
    </div>
  );
}

/** Document expiry as a coloured pill (expired / expiring / plain date). */
export function ExpiryPill({ date }: { date: Date | null }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>;
  if (days < 0) return <Pill tone="danger">Expired {formatDate(date)}</Pill>;
  if (days <= 30)
    return (
      <Pill tone="warning">
        Expires in {days} day{days === 1 ? '' : 's'}
      </Pill>
    );
  return <Pill>{formatDate(date)}</Pill>;
}
