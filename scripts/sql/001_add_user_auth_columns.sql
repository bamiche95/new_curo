-- 001_add_user_auth_columns.sql
--
-- Adds credential + login-tracking columns to the existing `users` table.
--
-- This is the reference SQL. It is applied automatically (and idempotently) by:
--   node scripts/migrate-auth.mjs
--
-- Run against: curo_next_db

ALTER TABLE `users`
  ADD COLUMN `password_hash`        varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `email`,
  ADD COLUMN `must_change_password` tinyint(1)   NOT NULL DEFAULT 1           AFTER `password_hash`,
  ADD COLUMN `token_version`        int          NOT NULL DEFAULT 0           AFTER `must_change_password`,
  ADD COLUMN `failed_attempts`      int          NOT NULL DEFAULT 0           AFTER `token_version`,
  ADD COLUMN `locked_until`         datetime     DEFAULT NULL                 AFTER `failed_attempts`,
  ADD COLUMN `last_login_at`        datetime     DEFAULT NULL                 AFTER `locked_until`,
  ADD COLUMN `password_changed_at`  datetime     DEFAULT NULL                 AFTER `last_login_at`;

-- Authorization flag (added later, so it is its own statement): admins are the only
-- users who may restore or permanently delete customers from the Archived page.
-- Vtiger keeps this as the text 'on'/'off'; `npm run db:backfill-vtiger -- --admins`
-- copies it across, treating 'on' as true.
ALTER TABLE `users` ADD COLUMN `is_admin` tinyint(1) NOT NULL DEFAULT 0 AFTER `must_change_password`;

-- Login always looks a user up by email, which is already covered by the
-- existing unique key `uq_user_email`, so no extra index is required.
