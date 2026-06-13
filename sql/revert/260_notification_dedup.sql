DROP INDEX IF EXISTS esg.ux_notifications_dedup;
ALTER TABLE esg.notifications DROP COLUMN IF EXISTS dedup_key;
