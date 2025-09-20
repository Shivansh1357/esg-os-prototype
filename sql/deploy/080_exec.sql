CREATE INDEX IF NOT EXISTS et_tenant_period_factor_idx
  ON esg.emission_totals (tenant_id, period_start, period_end, factor_set_id);
CREATE INDEX IF NOT EXISTS et_tenant_entity_period_factor_idx
  ON esg.emission_totals (tenant_id, entity_id, period_start, period_end, factor_set_id);
CREATE INDEX IF NOT EXISTS cf_tenant_period_status_idx
  ON esg.compliance_findings (tenant_id, period_start, period_end, status);
CREATE INDEX IF NOT EXISTS si_tenant_period_idx
  ON esg.supplier_invites (tenant_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS sr_tenant_period_idx
  ON esg.supplier_responses (tenant_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS f_tenant_period_status_metric_idx
  ON esg.facts (tenant_id, period_start, period_end, status, metric_code);

CREATE OR REPLACE FUNCTION esg.q_prev_start(d date) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (date_trunc('quarter', d) - interval '3 months')::date $$;

CREATE OR REPLACE FUNCTION esg.q_end(d date) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (date_trunc('quarter', d) + interval '3 months' - interval '1 day')::date $$;

CREATE OR REPLACE FUNCTION esg.exec_kpis(
  _tenant uuid,
  _pstart date,
  _pend   date
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid; fs record; cur record; prev record;
        prev_start date := esg.q_prev_start(_pstart); prev_end date := esg.q_end(prev_start);
        comp record; cov jsonb; approved_count int;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;
  SELECT td.factor_set_id AS id, fs.code, fs.version INTO fs
  FROM esg.tenant_defaults td JOIN esg.factor_sets fs ON fs.id=td.factor_set_id
  WHERE td.tenant_id=_tenant LIMIT 1;
  SELECT COALESCE(SUM(scope1),0) AS s1, COALESCE(SUM(scope2_loc),0) AS s2_loc, COALESCE(SUM(scope2_mkt),0) AS s2_mkt, COALESCE(SUM(scope3),0) AS s3
    INTO cur FROM esg.emission_totals
   WHERE tenant_id=_tenant AND period_start=_pstart AND period_end=_pend AND factor_set_id = fs.id;
  SELECT COALESCE(SUM(scope1),0) AS s1, COALESCE(SUM(scope2_loc),0) AS s2_loc, COALESCE(SUM(scope2_mkt),0) AS s2_mkt, COALESCE(SUM(scope3),0) AS s3
    INTO prev FROM esg.emission_totals
   WHERE tenant_id=_tenant AND period_start=prev_start AND period_end=prev_end AND factor_set_id = fs.id;
  SELECT SUM((status='PASS')::int) AS pass, SUM((status='FAIL')::int) AS fail, SUM((status='RISK')::int) AS risk, COUNT(*) AS total
    INTO comp FROM esg.compliance_findings
   WHERE tenant_id=_tenant AND period_start=_pstart AND period_end=_pend;
  cov := esg.suppliers_coverage(_tenant, _pstart, _pend);
  SELECT COUNT(*)::int INTO approved_count FROM esg.facts
   WHERE tenant_id=_tenant AND period_start=_pstart AND period_end=_pend AND status='APPROVED';
  RETURN jsonb_build_object(
    'totals', jsonb_build_object('s1', cur.s1, 's2_loc', cur.s2_loc, 's2_mkt', cur.s2_mkt, 's3', cur.s3),
    'yoy', jsonb_build_object(
      'prevStart', prev_start, 'prevEnd', prev_end,
      'totals', jsonb_build_object('s1', prev.s1, 's2_loc', prev.s2_loc, 's2_mkt', prev.s2_mkt, 's3', prev.s3),
      'deltaPct', jsonb_build_object(
        's1', CASE WHEN prev.s1=0 THEN NULL ELSE round(((cur.s1-prev.s1)/NULLIF(prev.s1,0))*100,2) END,
        's2_loc', CASE WHEN prev.s2_loc=0 THEN NULL ELSE round(((cur.s2_loc-prev.s2_loc)/NULLIF(prev.s2_loc,0))*100,2) END,
        's2_mkt', CASE WHEN prev.s2_mkt=0 THEN NULL ELSE round(((cur.s2_mkt-prev.s2_mkt)/NULLIF(prev.s2_mkt,0))*100,2) END,
        's3', CASE WHEN prev.s3=0 THEN NULL ELSE round(((cur.s3-prev.s3)/NULLIF(prev.s3,0))*100,2) END
      )
    ),
    'completeness', jsonb_build_object(
      'pass', COALESCE(comp.pass,0), 'fail', COALESCE(comp.fail,0), 'risk', COALESCE(comp.risk,0), 'total', COALESCE(comp.total,0),
      'percent', CASE WHEN COALESCE(comp.total,0) > 0 THEN round((COALESCE(comp.pass,0)::numeric/comp.total)*100,2) ELSE 0 END
    ),
    'suppliers', cov,
    'approvedFacts', approved_count,
    'factorSet', jsonb_build_object('id', fs.id, 'code', fs.code, 'version', fs.version),
    'at', now()
  );
END $$;


