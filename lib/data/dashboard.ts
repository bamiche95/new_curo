/**
 * Read queries for the dashboard.
 * Customer-level queries live in `lib/data/customers.ts`.
 */
import 'server-only';

import { verifySession } from '@/lib/auth/dal';
import { queryOne, queryRows } from '@/lib/db';
import type { CommunicationListItem, LookupOption } from '@/lib/data/types';

export type DashboardStats = {
  customers: number;
  contacts: number;
  communications: number;
  recentCommunications: number;
};

export type Watchlist = {
  documentsExpiringSoon: number;
  documentsExpired: number;
  openQuotes: number;
  customersWithoutStatus: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  await verifySession();

  const row = await queryOne<{
    customers: number;
    contacts: number;
    communications: number;
    recent_communications: number;
  }>(`SELECT (SELECT COUNT(*) FROM customers cu WHERE cu.deleted_at IS NULL) AS customers,
             (SELECT COUNT(*) FROM contacts t
                JOIN customers cu ON cu.id = t.customer_id
               WHERE cu.deleted_at IS NULL) AS contacts,
             (SELECT COUNT(*) FROM communications c
                JOIN customers cu ON cu.id = c.customer_id
               WHERE cu.deleted_at IS NULL) AS communications,
             (SELECT COUNT(*) FROM communications c
                JOIN customers cu ON cu.id = c.customer_id
               WHERE cu.deleted_at IS NULL AND c.created_at >= NOW() - INTERVAL 30 DAY) AS recent_communications`);

  return {
    customers: Number(row?.customers ?? 0),
    contacts: Number(row?.contacts ?? 0),
    communications: Number(row?.communications ?? 0),
    recentCommunications: Number(row?.recent_communications ?? 0),
  };
}

export async function getRecentCommunications(limit = 10): Promise<CommunicationListItem[]> {
  await verifySession();

  return queryRows<CommunicationListItem>(
    `SELECT c.id,
            c.content,
            c.communication_type,
            c.created_at,
            c.customer_id,
            cu.account_no,
            cu.name AS customer_name,
            u.name AS author_name
       FROM communications c
       JOIN customers cu ON cu.id = c.customer_id AND cu.deleted_at IS NULL
       LEFT JOIN users u ON u.id = c.author_id
      ORDER BY c.created_at DESC
      LIMIT ?`,
    [limit]
  );
}

/** Customer counts per active status, plus how many customers have none set. */
export async function getStatusBreakdown(): Promise<{ statuses: LookupOption[]; unassigned: number }> {
  await verifySession();

  const statuses = await queryRows<LookupOption>(
    `SELECT cs.id, cs.name, cs.colour, COUNT(cu.id) AS customer_count
       FROM customer_id_statuses cs
       JOIN customers cu ON cu.customer_id_status_id = cs.id AND cu.deleted_at IS NULL
      WHERE cs.is_active = 1
      GROUP BY cs.id, cs.name, cs.colour, cs.sort_order
      ORDER BY cs.sort_order ASC`
  );

  const unassignedRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM customers WHERE customer_id_status_id IS NULL AND deleted_at IS NULL'
  );

  return { statuses, unassigned: Number(unassignedRow?.total ?? 0) };
}

/** Top industries by customer count. */
export async function getTopIndustries(limit = 8): Promise<LookupOption[]> {
  await verifySession();

  return queryRows<LookupOption>(
    `SELECT i.id, i.name, NULL AS colour, COUNT(cu.id) AS customer_count
       FROM industries i
       JOIN customers cu ON cu.industry_id = i.id AND cu.deleted_at IS NULL
      WHERE i.is_active = 1
      GROUP BY i.id, i.name
      ORDER BY customer_count DESC, i.name ASC
      LIMIT ?`,
    [limit]
  );
}

/**
 * Counters that stay honestly at zero until quotes and documents are entered.
 * Expiry uses the documents.document_expiry_date index.
 */
export async function getWatchlist(): Promise<Watchlist> {
  await verifySession();

  const row = await queryOne<{
    expiring: number;
    expired: number;
    open_quotes: number;
    no_status: number;
  }>(`SELECT
        (SELECT COUNT(*) FROM documents d
           JOIN customers cu ON cu.id = d.customer_id
          WHERE cu.deleted_at IS NULL
            AND d.document_expiry_date IS NOT NULL
            AND d.document_expiry_date >= CURDATE()
            AND d.document_expiry_date <= CURDATE() + INTERVAL 30 DAY) AS expiring,
        (SELECT COUNT(*) FROM documents d
           JOIN customers cu ON cu.id = d.customer_id
          WHERE cu.deleted_at IS NULL
            AND d.document_expiry_date IS NOT NULL
            AND d.document_expiry_date < CURDATE()) AS expired,
        (SELECT COUNT(*) FROM quotes q
           JOIN customers cu ON cu.id = q.customer_id
          WHERE cu.deleted_at IS NULL AND q.status IN ('DRAFT', 'SENT', 'PENDING')) AS open_quotes,
        (SELECT COUNT(*) FROM customers
          WHERE customer_id_status_id IS NULL AND deleted_at IS NULL) AS no_status`);

  return {
    documentsExpiringSoon: Number(row?.expiring ?? 0),
    documentsExpired: Number(row?.expired ?? 0),
    openQuotes: Number(row?.open_quotes ?? 0),
    customersWithoutStatus: Number(row?.no_status ?? 0),
  };
}
