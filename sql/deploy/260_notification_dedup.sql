-- 260_notification_dedup.sql
-- Optional dedup key on notifications so a retried background job cannot insert
-- duplicate rows. NULL key = no dedup (existing/manual inserts are unaffected).

ALTER TABLE esg.notifications ADD COLUMN IF NOT EXISTS dedup_key text;

-- Partial unique index: only rows that opt in (non-NULL key) are deduplicated,
-- scoped per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_dedup
  ON esg.notifications (tenant_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
