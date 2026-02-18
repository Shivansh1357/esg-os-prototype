CREATE TABLE IF NOT EXISTS esg.pilot_metrics (
  tenant_id uuid PRIMARY KEY REFERENCES esg.tenants(id) ON DELETE CASCADE,
  first_fact_at timestamptz,
  first_approval_at timestamptz,
  first_freeze_at timestamptz,
  first_exec_view_at timestamptz,
  supplier_invite_count integer NOT NULL DEFAULT 0,
  feedback_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esg.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  role text NOT NULL CHECK (role IN ('ADMIN','MEMBER','AUDITOR','SUPPLIER')),
  page text NOT NULL,
  message text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE esg.pilot_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='pilot_metrics' AND policyname='pilot_metrics_rls') THEN
    CREATE POLICY pilot_metrics_rls ON esg.pilot_metrics
      FOR ALL USING (tenant_id = app.current_tenant())
      WITH CHECK (tenant_id = app.current_tenant());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='feedback' AND policyname='feedback_rls') THEN
    CREATE POLICY feedback_rls ON esg.feedback
      FOR ALL USING (tenant_id = app.current_tenant())
      WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION esg.record_pilot_event(
  _tenant uuid,
  _event text,
  _count integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO esg.pilot_metrics (tenant_id)
  VALUES (_tenant)
  ON CONFLICT (tenant_id) DO NOTHING;

  IF _event = 'first_fact' THEN
    UPDATE esg.pilot_metrics
       SET first_fact_at = COALESCE(first_fact_at, now())
     WHERE tenant_id = _tenant;
  ELSIF _event = 'first_approval' THEN
    UPDATE esg.pilot_metrics
       SET first_approval_at = COALESCE(first_approval_at, now())
     WHERE tenant_id = _tenant;
  ELSIF _event = 'first_freeze' THEN
    UPDATE esg.pilot_metrics
       SET first_freeze_at = COALESCE(first_freeze_at, now())
     WHERE tenant_id = _tenant;
  ELSIF _event = 'first_exec_view' THEN
    UPDATE esg.pilot_metrics
       SET first_exec_view_at = COALESCE(first_exec_view_at, now())
     WHERE tenant_id = _tenant;
  ELSIF _event = 'supplier_invite' THEN
    UPDATE esg.pilot_metrics
       SET supplier_invite_count = supplier_invite_count + GREATEST(COALESCE(_count, 1), 1)
     WHERE tenant_id = _tenant;
  ELSIF _event = 'feedback' THEN
    UPDATE esg.pilot_metrics
       SET feedback_count = feedback_count + GREATEST(COALESCE(_count, 1), 1)
     WHERE tenant_id = _tenant;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION esg.get_onboarding_checklist(_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  has_first_fact boolean := false;
  has_approved_fact boolean := false;
  has_compliance boolean := false;
  has_freeze boolean := false;
  has_supplier_invite boolean := false;
  done_count integer := 0;
  pct numeric := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM esg.facts f
     WHERE f.tenant_id = _tenant
  ) INTO has_first_fact;

  SELECT EXISTS (
    SELECT 1 FROM esg.facts f
     WHERE f.tenant_id = _tenant
       AND f.status = 'APPROVED'
  ) INTO has_approved_fact;

  SELECT EXISTS (
    SELECT 1 FROM esg.compliance_findings cf
     WHERE cf.tenant_id = _tenant
  ) INTO has_compliance;

  SELECT EXISTS (
    SELECT 1 FROM esg.reports r
     WHERE r.tenant_id = _tenant
       AND COALESCE(r.is_locked, r.locked, false)
  ) INTO has_freeze;

  SELECT EXISTS (
    SELECT 1 FROM esg.supplier_invites si
     WHERE si.tenant_id = _tenant
  ) INTO has_supplier_invite;

  done_count :=
    (CASE WHEN has_first_fact THEN 1 ELSE 0 END) +
    (CASE WHEN has_approved_fact THEN 1 ELSE 0 END) +
    (CASE WHEN has_compliance THEN 1 ELSE 0 END) +
    (CASE WHEN has_freeze THEN 1 ELSE 0 END) +
    (CASE WHEN has_supplier_invite THEN 1 ELSE 0 END);

  pct := round((done_count::numeric / 5.0) * 100, 2);

  RETURN jsonb_build_object(
    'percent', pct,
    'items', jsonb_build_array(
      jsonb_build_object('key', 'add_first_fact', 'label', 'Add first fact', 'done', has_first_fact),
      jsonb_build_object('key', 'approve_fact', 'label', 'Approve fact', 'done', has_approved_fact),
      jsonb_build_object('key', 'run_compliance', 'label', 'Run compliance', 'done', has_compliance),
      jsonb_build_object('key', 'freeze_report', 'label', 'Freeze report', 'done', has_freeze),
      jsonb_build_object('key', 'invite_supplier', 'label', 'Invite supplier', 'done', has_supplier_invite)
    )
  );
END;
$$;

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
  footnote text;
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

  footnote := CASE
    WHEN mode = 'snapshot' THEN format(
      'Generated from frozen snapshot. Calc version: %s. Factor set: %s. Completeness: %s%%.',
      calc_ver,
      COALESCE(fs->>'code', 'N/A'),
      completeness
    )
    ELSE format(
      'Generated from live draft data. Calc version: %s. Factor set: %s. Completeness: %s%%.',
      calc_ver,
      COALESCE(fs->>'code', 'N/A'),
      completeness
    )
  END;

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
    'outlierCount', outlier_count,
    'footnote', footnote
  );
END;
$$;
