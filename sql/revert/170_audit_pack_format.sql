ALTER TABLE esg.report_artifacts DROP CONSTRAINT IF EXISTS report_artifacts_format_check;
ALTER TABLE esg.report_artifacts ADD CONSTRAINT report_artifacts_format_check CHECK (format IN ('pdf','xlsx'));
