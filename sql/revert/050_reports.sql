DROP FUNCTION IF EXISTS esg.default_report_period(uuid);
DROP TRIGGER IF EXISTS trg_sections_touch ON esg.report_sections;
DROP TRIGGER IF EXISTS trg_reports_touch ON esg.reports;
DROP FUNCTION IF EXISTS esg.touch_updated_at();

DROP TABLE IF EXISTS esg.report_artifacts;
DROP TABLE IF EXISTS esg.report_sections;
DROP TABLE IF EXISTS esg.reports;
DROP TYPE  IF EXISTS esg.section_status;


