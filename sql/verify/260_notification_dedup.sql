-- Errors (failing verify) if the column or index is missing.
SELECT dedup_key FROM esg.notifications WHERE false;
SELECT 1 / (CASE WHEN to_regclass('esg.ux_notifications_dedup') IS NOT NULL THEN 1 ELSE 0 END);
