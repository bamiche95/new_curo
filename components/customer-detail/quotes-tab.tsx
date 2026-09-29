import { Pill } from '@/components/badges';
import { EmptyRow, QUOTE_TONES, SectionCard } from '@/components/customer-detail/section';
import { formatDate, formatMoney } from '@/lib/format';
import type { QuoteRow } from '@/lib/data/types';

/** Quotes for the customer (read-only until the quote builder exists). */
export function QuotesTab({ quotes }: { quotes: QuoteRow[] }) {
  return (
    <SectionCard title="Quotes" count={quotes.length}>
      {quotes.length === 0 ? (
        <EmptyRow>No quotes yet.</EmptyRow>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{quote.quote_name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {quote.quote_no ?? 'No number'} · {formatDate(quote.quote_date)}
                  {quote.valid_until ? ` · valid until ${formatDate(quote.valid_until)}` : ''}
                  {quote.quote_type_name ? ` · ${quote.quote_type_name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-700 dark:text-zinc-300">{formatMoney(quote.amount, quote.currency)}</span>
                <Pill tone={QUOTE_TONES[quote.status] ?? 'neutral'}>{quote.status}</Pill>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
