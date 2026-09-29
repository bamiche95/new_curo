-- 003_communication_mentions.sql
--
-- Contacts (and colleagues) tagged in a comment. One row per tagged target:
-- `contact_id` for a contact of the customer, `user_id` for a signed-in user, never
-- both and never neither - enforced by the data layer (`addCustomerComment`), because
-- MySQL refuses a CHECK constraint on columns that carry a foreign-key referential
-- action and both targets have to cascade.
--
-- Both targets cascade, so a comment's tags disappear with the comment, and the
-- existing permanent-delete path (communications ON DELETE CASCADE) needs no change.
-- The UNIQUE keys make a tag idempotent: MySQL treats the unused NULL as distinct, so
-- `(communication_id, contact_id)` still allows many user-only mentions of one
-- comment and vice versa.
--
-- This file is the single source of truth: `scripts/migrate-comment-mentions.mjs`
-- reads it and applies each statement idempotently, so it is safe to run repeatedly
-- (no semicolons in these comments - the runner splits on them).
--
-- Run against: curo_next_db

CREATE TABLE IF NOT EXISTS `communication_mentions` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `communication_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_communication_mentions_contact` (`communication_id`,`contact_id`),
  UNIQUE KEY `uq_communication_mentions_user` (`communication_id`,`user_id`),
  KEY `idx_communication_mentions_contact` (`contact_id`),
  KEY `idx_communication_mentions_user` (`user_id`),
  CONSTRAINT `fk_communication_mentions_communication` FOREIGN KEY (`communication_id`) REFERENCES `communications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_communication_mentions_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_communication_mentions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
