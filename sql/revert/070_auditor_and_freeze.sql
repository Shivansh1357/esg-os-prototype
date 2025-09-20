DROP FUNCTION IF EXISTS esg.freeze_report(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS esg.report_lineage(uuid,uuid);

DROP TABLE IF EXISTS esg.report_freezes;

ALTER TABLE esg.reports
  DROP COLUMN IF EXISTS frozen_by,
  DROP COLUMN IF EXISTS frozen_at,
  DROP COLUMN IF EXISTS version_minor,
  DROP COLUMN IF EXISTS version_major,
  DROP COLUMN IF EXISTS locked;


