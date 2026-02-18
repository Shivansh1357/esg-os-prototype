DROP FUNCTION IF EXISTS esg.refresh_exec_kpi_base();
DROP MATERIALIZED VIEW IF EXISTS esg.exec_kpi_base;

\ir ../deploy/090_compliance_hardening.sql
\ir ../deploy/100_report_freeze_hardening.sql
\ir ../deploy/120_exec_cockpit_kpis.sql
