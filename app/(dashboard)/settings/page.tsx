import type { Metadata } from 'next';

import { SettingsCard, type SettingsCardProps } from '@/components/settings-card';
import { verifySession } from '@/lib/auth/dal';
import { getSettingsOverview } from '@/lib/data/settings';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Settings',
};

/**
 * The settings hub.
 *
 * One card per area of reference data, counted live by `getSettingsOverview()`
 * (which re-verifies the session itself, like every other read in `lib/data`).
 * A card is a link once its page exists and a dashed, non-clickable card until
 * then, so nothing here can lead to a 404. Areas whose page 404s for ordinary
 * users — see `verifyAdminPage()` — are only rendered for administrators, the same
 * way the Archived nav link is. Adding an area is one more entry in `areas`.
 */
export default async function SettingsPage() {
  const user = await verifySession();
  const overview = await getSettingsOverview();

  const areas: SettingsCardProps[] = [
    {
      title: 'Industries',
      description: 'The Industry picklist on the customers table and the Top industries panel on the dashboard.',
      stat:
        overview.industriesInactive > 0
          ? `${formatNumber(overview.industries)} industries · ${formatNumber(overview.industriesInactive)} switched off`
          : `${formatNumber(overview.industries)} industries`,
      href: '/settings/industries',
    },
    {
      title: 'Customer statuses',
      description: 'The status picklist, including the colour each status shows on the customers table.',
      stat: `${formatNumber(overview.statuses)} statuses`,
      href: '/settings/customer-statuses',
    },
    {
      title: 'Quote types',
      description: 'The types available when a quote is raised against a customer.',
      stat: `${formatNumber(overview.quoteTypes)} types`,
      href: null,
    },
    {
      title: 'Users',
      description: 'Who can sign in, who is an administrator, and password resets.',
      stat: `${formatNumber(overview.users)} users · ${formatNumber(overview.admins)} administrators`,
      href: '/settings/users',
      adminOnly: true,
    },
    {
      title: 'Assignment groups',
      description: 'The owner groups a customer can be assigned to, and who belongs to each one.',
      stat: `${formatNumber(overview.assignmentGroups)} groups`,
      href: null,
      adminOnly: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The reference data behind the picklists. Everyone can add to a list; only an administrator can change or
          remove an entry.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas
          .filter((area) => !area.adminOnly || user.isAdmin)
          .map((area) => (
            <SettingsCard key={area.title} {...area} />
          ))}
      </section>
    </div>
  );
}