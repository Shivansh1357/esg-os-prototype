CREATE OR REPLACE FUNCTION esg.get_report_export_payload(
  _tenant uuid,
  _report uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE AS $$
DECLARE
  rpt record;
  mode text;
  fs jsonb;
  totals jsonb;
  compliance jsonb;
  findings jsonb;
  outlier_count int := 0;
  calc_ver int := 1;
  completeness numeric := 0;
  snap jsonb;
BEGIN
  SELECT id, tenant_id, name, template, period_start, period_end, is_locked, locked,
         factor_set_id, calc_version, compliance_snapshot, completeness_percent, frozen_at
    INTO rpt
    FROM esg.reports
   WHERE id = _report
     AND tenant_id = _tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found' USING ERRCODE = 'P0002';
  END IF;

  IF app.current_tenant() IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  mode := CASE WHEN COALESCE(rpt.is_locked, false) OR COALESCE(rpt.locked, false) THEN 'snapshot' ELSE 'live' END;

  IF mode = 'snapshot' THEN
    SELECT rf.snapshot
      INTO snap
      FROM esg.report_freezes rf
     WHERE rf.tenant_id = _tenant
       AND rf.report_id = _report
     ORDER BY rf.version_major DESC, rf.version_minor DESC
     LIMIT 1;

    IF snap IS NULL THEN
      snap := '{}'::jsonb;
    END IF;

    calc_ver := COALESCE(rpt.calc_version, NULLIF(snap->>'calcVersion','')::int, 1);
    completeness := COALESCE(rpt.completeness_percent, NULLIF(snap->>'completenessPercent','')::numeric, 0);
    findings := COALESCE(rpt.compliance_snapshot, snap->'complianceFindings', '[]'::jsonb);

    SELECT to_jsonb(x)
      INTO fs
      FROM (
        SELECT id, code, name, version
          FROM esg.factor_sets
         WHERE id = rpt.factor_set_id
      ) x;

    SELECT jsonb_build_object(
             's1', COALESCE(SUM(COALESCE(NULLIF(e->'totals'->>'scope1','')::numeric, 0)), 0),
             's2l', COALESCE(SUM(COALESCE(NULLIF(e->'totals'->>'scope2_loc','')::numeric, 0)), 0),
             's2m', COALESCE(SUM(COALESCE(NULLIF(e->'totals'->>'scope2_mkt','')::numeric, 0)), 0),
             's3', COALESCE(SUM(COALESCE(NULLIF(e->'totals'->>'scope3','')::numeric, 0)), 0)
           )
      INTO totals
      FROM jsonb_array_elements(COALESCE(snap->'lineage'->'entities', '[]'::jsonb)) e;

    SELECT jsonb_build_object(
             'pass', COUNT(*) FILTER (WHERE f->>'status' = 'PASS'),
             'fail', COUNT(*) FILTER (WHERE f->>'status' = 'FAIL'),
             'risk', COUNT(*) FILTER (WHERE f->>'status' = 'RISK'),
             'total', COUNT(*)
           )
      INTO compliance
      FROM jsonb_array_elements(COALESCE(findings, '[]'::jsonb)) f;

    SELECT COALESCE(COUNT(*), 0)::int
      INTO outlier_count
      FROM jsonb_array_elements(COALESCE(snap->'lineage'->'entities', '[]'::jsonb)) e,
           LATERAL jsonb_array_elements(COALESCE(e->'facts', '[]'::jsonb)) f
     WHERE COALESCE((f->>'outlier')::boolean, false);
  ELSE
    SELECT to_jsonb(x)
      INTO fs
      FROM (
        SELECT fs.id, fs.code, fs.name, fs.version
          FROM esg.tenant_defaults td
          JOIN esg.factor_sets fs ON fs.id = td.factor_set_id
         WHERE td.tenant_id = _tenant
         LIMIT 1
      ) x;

    SELECT jsonb_build_object(
             's1', COALESCE(SUM(scope1),0),
             's2l', COALESCE(SUM(scope2_loc),0),
             's2m', COALESCE(SUM(scope2_mkt),0),
             's3', COALESCE(SUM(scope3),0)
           ),
           COALESCE(MAX(calc_version), 1)
      INTO totals, calc_ver
      FROM esg.emission_totals
     WHERE tenant_id = _tenant
       AND period_start = rpt.period_start
       AND period_end = rpt.period_end
       AND factor_set_id = (fs->>'id')::uuid;

    SELECT jsonb_build_object(
             'pass', SUM((status='PASS')::int),
             'fail', SUM((status='FAIL')::int),
             'risk', SUM((status='RISK')::int),
             'total', COUNT(*)
           ),
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'id', cf.id,
                 'ruleId', cf.rule_id,
                 'ruleCode', cf.rule_code,
                 'framework', cr.framework,
                 'description', cr.description,
                 'metricCode', cr.metric_code,
                 'requiresEvidence', cr.requires_evidence,
                 'status', cf.status::text,
                 'reason', cf.reason,
                 'severity', cf.severity,
                 'evidenceUrl', cf.evidence_url,
                 'completenessWeight', cf.completeness_weight,
                 'lastEvaluatedAt', cf.last_evaluated_at
               )
               ORDER BY cf.rule_code
             ),
             '[]'::jsonb
           )
      INTO compliance, findings
      FROM esg.compliance_findings cf
      JOIN esg.compliance_rules cr ON cr.id = cf.rule_id
     WHERE cf.tenant_id = _tenant
       AND cf.period_start = rpt.period_start
       AND cf.period_end = rpt.period_end;

    SELECT COALESCE(COUNT(*),0)::int
      INTO outlier_count
      FROM esg.facts
     WHERE tenant_id = _tenant
       AND period_start = rpt.period_start
       AND period_end = rpt.period_end
       AND (quality_flags->>'outlier')::bool IS TRUE;

    completeness := COALESCE(esg.completeness_percent(_tenant, rpt.period_start, rpt.period_end), 0);
  END IF;

  RETURN jsonb_build_object(
    'mode', mode,
    'report', jsonb_build_object(
      'id', rpt.id,
      'name', rpt.name,
      'template', rpt.template,
      'periodStart', rpt.period_start,
      'periodEnd', rpt.period_end,
      'isLocked', mode = 'snapshot',
      'frozenAt', rpt.frozen_at
    ),
    'factorSet', COALESCE(fs, '{}'::jsonb),
    'calcVersion', calc_ver,
    'completenessPercent', completeness,
    'totals', COALESCE(totals, jsonb_build_object('s1',0,'s2l',0,'s2m',0,'s3',0)),
    'compliance', COALESCE(compliance, jsonb_build_object('pass',0,'fail',0,'risk',0,'total',0)),
    'complianceFindings', COALESCE(findings, '[]'::jsonb),
    'outlierCount', outlier_count
  );
END;
$$;

DROP FUNCTION IF EXISTS esg.get_onboarding_checklist(uuid);
DROP FUNCTION IF EXISTS esg.record_pilot_event(uuid, text, integer);
DROP TABLE IF EXISTS esg.feedback;
DROP TABLE IF EXISTS esg.pilot_metrics;
