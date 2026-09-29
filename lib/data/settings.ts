/**
 * Read queries for the settings hub.
 *
 * The hub only shows totals, so they come back in one round trip of scalar
 * subqueries — the same shape `getDashboardStats()` uses. Every exported function
 * re-verifies the session, so the counts can never be read by an unauthenticated
 * caller even if Proxy were bypassed.
 */
import 'server-only';

import { verifySession } from '@/lib/auth/dal';
import { queryOne } from '@/lib/db';

export type SettingsOverview = {
  industries: number;
  /** How many of them are switched off (hidden from the customers picklist). */
  industriesInactive: number;
  statuses: number;
  quoteTypes: number;
  assignmentGroups: number;
  users: number;
  admins: number;
};

/** One card per area: how many values each one holds today. */
export async function getSettingsOverview(): Promise<SettingsOverview> {
  await verifySession();

  const row = await queryOne<{
    industries: number;
    industries_inactive: number;
    statuses: number;
    quote_types: number;
    assignment_groups: number;
    users: number;
    admins: number;
  }>(`SELECT (SELECT COUNT(*) FROM industries) AS industries,
             (SELECT COUNT(*) FROM industries WHERE is_active = 0) AS industries_inactive,
             (SELECT COUNT(*) FROM customer_id_statuses) AS statuses,
             (SELECT COUNT(*) FROM quote_types) AS quote_types,
             (SELECT COUNT(*) FROM assignment_groups) AS assignment_groups,
             (SELECT COUNT(*) FROM users) AS users,
             (SELECT COUNT(*) FROM users WHERE is_admin = 1) AS admins`);

  return {
    industries: Number(row?.industries ?? 0),
    industriesInactive: Number(row?.industries_inactive ?? 0),
    statuses: Number(row?.statuses ?? 0),
    quoteTypes: Number(row?.quote_types ?? 0),
    assignmentGroups: Number(row?.assignment_groups ?? 0),
    users: Number(row?.users ?? 0),
    admins: Number(row?.admins ?? 0),
  };
}