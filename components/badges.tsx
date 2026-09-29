import Link from 'next/link';
import type { ReactNode } from 'react';

/** Status dot + label, using the colour stored on the status lookup. */
export function StatusBadge({
  name,
  colour,
  href,
}: {
  name: string | null;
  colour?: string | null;
  href?: string;
}) {
  if (!name) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No status
      </span>
    );
  }

  const base =
    'inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300';
  const dot = (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full border border-black/10 dark:border-white/20"
      style={{ backgroundColor: colour || '#a1a1aa' }}
    />
  );

  if (href) {
    return (
      <Link href={href} className={`${base} hover:bg-zinc-200 dark:hover:bg-zinc-800`}>
        {dot}
        {name}
      </Link>
    );
  }

  return (
    <span className={base}>
      {dot}
      {name}
    </span>
  );
}

/** Neutral pill for an industry. */
export function IndustryBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>;

  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
      {name}
    </span>
  );
}

const TONES = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  positive: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

/** Small label for quote statuses, document types, activity actions, etc. */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
