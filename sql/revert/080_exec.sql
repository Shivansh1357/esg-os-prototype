DROP FUNCTION IF EXISTS esg.exec_kpis(uuid,date,date);
DROP FUNCTION IF EXISTS esg.q_end(date);
DROP FUNCTION IF EXISTS esg.q_prev_start(date);

DROP INDEX IF EXISTS f_tenant_period_status_metric_idx;
DROP INDEX IF EXISTS sr_tenant_period_idx;
DROP INDEX IF EXISTS si_tenant_period_idx;
DROP INDEX IF EXISTS cf_tenant_period_status_idx;
DROP INDEX IF EXISTS et_tenant_entity_period_factor_idx;
DROP INDEX IF EXISTS et_tenant_period_factor_idx;


