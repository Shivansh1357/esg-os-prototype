DROP FUNCTION IF EXISTS esg.scope3_supplier_total(uuid,date,date);
DROP INDEX IF EXISTS esg.supplier_responses_tenant_period_approved_idx;

ALTER TABLE esg.supplier_responses
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS data_quality_tier,
  DROP COLUMN IF EXISTS approved;

\ir ../deploy/100_report_freeze_hardening.sql
\ir ../deploy/130_exec_kpi_read_path.sql
