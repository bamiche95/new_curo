import { Pill } from '@/components/badges';
import { ACTIVITY_TONES, EmptyRow, Pager, SectionCard } from '@/components/customer-detail/section';
import { formatDateTime } from '@/lib/format';
import type { ActivityRow, PagedResult } from '@/lib/data/types';

/** The customer's edit history: one row per change, whoever made it. */
export function UpdatesTab({
  customerId,
  activity,
}: {
  customerId: string;
  activity: PagedResult<ActivityRow>;
}) {
  return (
    <SectionCard title="Updates" count={activity.total}>
      {activity.rows.length === 0 ? (
        <EmptyRow>No changes recorded yet.</EmptyRow>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {activity.rows.map((entry) => (
            <li key={entry.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Pill tone={ACTIVITY_TONES[entry.action] ?? 'neutral'}>{entry.action}</Pill>
                <span>{formatDateTime(entry.created_at)}</span>
                {entry.actor_name ? <span>· {entry.actor_name}</span> : null}
              </div>
              <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                {entry.field_name
                  ? `${entry.field_name}: ${entry.old_value ?? '—'} → ${entry.new_value ?? '—'}`
                  : (entry.description ?? '—')}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={activity.page}
        pageCount={activity.pageCount}
        hrefFor={(page) => `/customers/${customerId}?tab=updates&activityPage=${page}`}
      />
    </SectionCard>
  );
}
