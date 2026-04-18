-- 170_audit_pack_format.sql
-- Allow 'zip' format in report_artifacts for audit pack exports.

ALTER TABLE esg.report_artifacts DROP CONSTRAINT IF EXISTS report_artifacts_format_check;
ALTER TABLE esg.report_artifacts ADD CONSTRAINT report_artifacts_format_check CHECK (format IN ('pdf','xlsx','zip','json'));
