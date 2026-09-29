import Link from 'next/link';

import { Pill } from '@/components/badges';

/** The dashboard's card look, reused so the two grids cannot drift apart. */
const cardClasses = 'flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950';

export type SettingsCardProps = {
  title: string;
  description: string;
  /** A live one-liner, e.g. `42 industries`. */
  stat: string;
  /** `null` while the area has no page yet: the card renders, but has nothing to click. */
  href: string | null;
  /**
   * Marks an area whose page is administrator-only. It is read by the hub, which
   * renders those cards for administrators alone — the page 404s for everyone else,
   * and the permission itself is enforced again in the data layer.
   */
  adminOnly?: boolean;
};

/**
 * One area of reference data on the settings hub.
 *
 * Two variants of the same card: a link once the page exists, and a dashed,
 * non-clickable card — badged **Coming soon** — until then, so the hub can never
 * lead to a 404.
 */
export function SettingsCard({ title, description, stat, href }: SettingsCardProps) {
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2
          className={`text-sm font-semibold ${
            href ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-300'
          }`}
        >
          {title}
        </h2>
        {href ? null : <Pill>Coming soon</Pill>}
      </div>

      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">{stat}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`${cardClasses} transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60`}
      >
        {body}
      </Link>
    );
  }

  return <div className={`${cardClasses} border-dashed`}>{body}</div>;
}