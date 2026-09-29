-- 002_customer_extras.sql
--
-- Customer status / industry lookups, quotes, addresses, documents and an
-- activity trail. Everything except the lookups references `customers`.
--
-- This file is the single source of truth: `scripts/migrate-customer-extras.mjs`
-- reads it and applies each statement idempotently (per-element guards), so it is
-- safe to run repeatedly and safe to paste manually.
--
-- Run against: curo_next_db

-- ---------------------------------------------------------------------------
-- 1) Lookup: quote types  (target of quotes.quote_type_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quote_types` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quote_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2) Lookup: customer ID status  (target of customers.customer_id_status_id)
--    Seeded by scripts/seed-lookups.mjs from the Vtiger picklist vtiger_cf_799.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_id_statuses` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `colour` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_id_statuses_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3) Lookup: industries  (target of customers.industry_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `industries` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_industries_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4) Quotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quotes` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_type_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_date` date NOT NULL,
  `valid_until` date DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `amount` decimal(12,2) DEFAULT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GBP',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_by` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quotes_quote_no` (`quote_no`),
  KEY `idx_quotes_customer_date` (`customer_id`,`quote_date` DESC),
  KEY `idx_quotes_type` (`quote_type_id`),
  KEY `idx_quotes_status` (`status`),
  KEY `idx_quotes_created_by` (`created_by`),
  KEY `idx_quotes_modified_by` (`modified_by`),
  CONSTRAINT `fk_quote_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_type` FOREIGN KEY (`quote_type_id`) REFERENCES `quote_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_modified_by` FOREIGN KEY (`modified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5) Customer addresses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_addresses` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BILLING',
  `address` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address_line2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `town` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `county` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postcode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customer_addresses_customer` (`customer_id`),
  KEY `idx_customer_addresses_type` (`customer_id`,`address_type`),
  KEY `idx_customer_addresses_postcode` (`postcode`),
  KEY `idx_customer_addresses_source` (`source`),
  CONSTRAINT `fk_address_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6) Documents
--    storage_type = 'FILE' -> document_path is a key inside
--                             private/customer-documents/<customer_id>/
--    storage_type = 'URL'  -> document_path is an external link
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `documents` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_path` varchar(1024) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storage_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FILE',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `document_expiry_date` date DEFAULT NULL,
  `created_by` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_documents_customer` (`customer_id`),
  KEY `idx_documents_expiry` (`document_expiry_date`),
  KEY `idx_documents_type` (`document_type`),
  KEY `idx_documents_created_by` (`created_by`),
  CONSTRAINT `fk_document_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_document_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7) Customer activity (audit trail of changes to a customer and its records)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_activity` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `field_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_value` text COLLATE utf8mb4_unicode_ci,
  `new_value` text COLLATE utf8mb4_unicode_ci,
  `description` text COLLATE utf8mb4_unicode_ci,
  `actor_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customer_activity_customer_time` (`customer_id`,`created_at` DESC),
  KEY `idx_customer_activity_actor` (`actor_id`),
  KEY `idx_customer_activity_action` (`action`),
  KEY `idx_customer_activity_entity` (`entity_type`,`entity_id`),
  CONSTRAINT `fk_activity_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_activity_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8) Link customers to one status and one industry each.
--    One statement per element so the runner can guard them individually.
-- ---------------------------------------------------------------------------
ALTER TABLE `customers` ADD COLUMN `customer_id_status_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `transport_customer_id`;
ALTER TABLE `customers` ADD COLUMN `industry_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `customer_id_status_id`;
ALTER TABLE `customers` ADD KEY `idx_customers_status` (`customer_id_status_id`);
ALTER TABLE `customers` ADD KEY `idx_customers_industry` (`industry_id`);
ALTER TABLE `customers` ADD CONSTRAINT `fk_customer_id_status` FOREIGN KEY (`customer_id_status_id`) REFERENCES `customer_id_statuses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customers` ADD CONSTRAINT `fk_customer_industry` FOREIGN KEY (`industry_id`) REFERENCES `industries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9) Address extras used by the Vtiger import:
--    `county` holds Vtiger's bill_state/ship_state and
--    `source` marks where an address came from ('VTIGER' | 'MANUAL') so the
--    import can be re-run without ever touching an address you entered by hand.
--    Fresh databases already have these via the CREATE TABLE above.
-- ---------------------------------------------------------------------------
ALTER TABLE `customer_addresses` ADD COLUMN `county` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `city`;
ALTER TABLE `customer_addresses` ADD COLUMN `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL' AFTER `is_default`;
ALTER TABLE `customer_addresses` ADD KEY `idx_customer_addresses_source` (`source`);

-- ---------------------------------------------------------------------------
-- 10) Saved data-table views: the columns, filters, sort and page size a user
--     has chosen for a table, so each user keeps their own view.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_saved_views` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `columns` json DEFAULT NULL,
  `filters` json DEFAULT NULL,
  `sort` json DEFAULT NULL,
  `page_size` int NOT NULL DEFAULT 25,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_saved_views_name` (`user_id`,`entity`,`name`),
  KEY `idx_user_saved_views_user` (`user_id`,`entity`),
  CONSTRAINT `fk_saved_view_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11) Ownership: who a customer is assigned to.
--     Vtiger keeps this in `vtiger_crmentity.smownerid`, which is *either* a
--     user id *or* a group id, so customers carry two nullable foreign keys and
--     the app keeps at most one of them set (NULL/NULL = unassigned). A CHECK
--     constraint cannot state that rule here: MySQL forbids CHECK columns that
--     take part in a foreign key referential action, and both FKs use
--     ON DELETE SET NULL.
--     Vtiger had 1,875 accounts owned by people and 2,781 owned by groups
--     ("Loop" alone holds 2,351), which is why groups are modelled properly
--     instead of being squashed into a text label.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assignment_groups` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vtiger_group_id` int DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assignment_groups_code` (`code`),
  UNIQUE KEY `uq_assignment_groups_vtiger` (`vtiger_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assignment_group_members` (
  `group_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`,`user_id`),
  KEY `idx_assignment_group_members_user` (`user_id`),
  CONSTRAINT `fk_assignment_group_members_group` FOREIGN KEY (`group_id`) REFERENCES `assignment_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_group_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `customers` ADD COLUMN `assigned_to` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `industry_id`;
ALTER TABLE `customers` ADD COLUMN `assigned_group_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `assigned_to`;
ALTER TABLE `customers` ADD KEY `idx_customers_assigned_to` (`assigned_to`);
ALTER TABLE `customers` ADD KEY `idx_customers_assigned_group` (`assigned_group_id`);
ALTER TABLE `customers` ADD CONSTRAINT `fk_customer_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customers` ADD CONSTRAINT `fk_customer_assigned_group` FOREIGN KEY (`assigned_group_id`) REFERENCES `assignment_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 12) Soft delete + the record of permanent deletions.
--
--     Archiving sets `deleted_at`/`deleted_by` and hides the customer from every
--     query (table, dashboard, lookups, detail page). It is reversible: only an
--     administrator can restore or permanently delete from /customers/archived,
--     and the permanent delete cascades into contacts, addresses, quotes,
--     documents, communications and customer_activity (all ON DELETE CASCADE).
--
--     `customer_deletion_log` therefore carries NO foreign keys: it has to survive
--     both the customer it describes and the user who did it, and it keeps the
--     child counts that were destroyed so the review screen can show the damage.
--     (No semicolons in these comments - the migration runner splits on them.)
-- ---------------------------------------------------------------------------
ALTER TABLE `customers` ADD COLUMN `deleted_at` datetime DEFAULT NULL AFTER `assigned_group_id`;
ALTER TABLE `customers` ADD COLUMN `deleted_by` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `deleted_at`;
ALTER TABLE `customers` ADD KEY `idx_customers_deleted_at` (`deleted_at`);
ALTER TABLE `customers` ADD CONSTRAINT `fk_customer_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `customer_deletion_log` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vtiger_account_id` int DEFAULT NULL,
  `contacts` int NOT NULL DEFAULT 0,
  `communications` int NOT NULL DEFAULT 0,
  `addresses` int NOT NULL DEFAULT 0,
  `quotes` int NOT NULL DEFAULT 0,
  `documents` int NOT NULL DEFAULT 0,
  `actor_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customer_deletion_log_customer` (`customer_id`),
  KEY `idx_customer_deletion_log_action` (`action`),
  KEY `idx_customer_deletion_log_time` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
