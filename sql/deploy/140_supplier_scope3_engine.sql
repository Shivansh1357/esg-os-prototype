ALTER TABLE esg.supplier_responses
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS data_quality_tier text NOT NULL DEFAULT 'PRIMARY',
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_responses_data_quality_tier_chk'
      AND conrelid = 'esg.supplier_responses'::regclass
  ) THEN
    ALTER TABLE esg.supplier_responses
      ADD CONSTRAINT supplier_responses_data_quality_tier_chk
      CHECK (data_quality_tier IN ('PRIMARY','SECONDARY','ESTIMATED'));
  END IF;
END $$;

UPDATE esg.supplier_responses sr
SET category = s.category
FROM esg.suppliers s
WHERE s.id = sr.supplier_id
  AND sr.category IS NULL;

CREATE INDEX IF NOT EXISTS supplier_responses_tenant_period_approved_idx
  ON esg.supplier_responses (tenant_id, period_start, period_end, approved);

CREATE OR REPLACE FUNCTION esg.scope3_supplier_total(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS numeric
LANGUAGE sql
STABLE AS $$
  SELECT COALESCE(SUM(sr.emissions_kgco2e), 0)
  FROM esg.supplier_responses sr
  WHERE sr.tenant_id = _tenant
    AND sr.period_start = _pstart
    AND sr.period_end = _pend
    AND sr.approved = true
$$;

CREATE OR REPLACE FUNCTION esg.suppliers_coverage(_tenant uuid, _pstart date, _pend date)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  spend_total numeric := 0;
  spend_cov numeric := 0;
  invited int := 0;
  responded int := 0;
BEGIN
  SELECT COALESCE(SUM(s.spend),0), COUNT(*)
    INTO spend_total, invited
  FROM esg.supplier_invites i
  JOIN esg.suppliers s ON s.id=i.supplier_id
  WHERE i.tenant_id=_tenant
    AND i.period_start=_pstart
    AND i.period_end=_pend;

  SELECT COALESCE(SUM(s.spend),0), COUNT(DISTINCT r.supplier_id)
    INTO spend_cov, responded
  FROM esg.supplier_responses r
  JOIN esg.suppliers s ON s.id=r.supplier_id
  WHERE r.tenant_id=_tenant
    AND r.period_start=_pstart
    AND r.period_end=_pend;

  RETURN jsonb_build_object(
    'invited', invited,
    'responded', responded,
    'spendTotal', spend_total,
    'spendCovered', spend_cov,
    'coveragePercent', CASE WHEN spend_total>0 THEN round((spend_cov/spend_total)*100,2) ELSE 0 END,
    'coverageByCountPercent', CASE WHEN invited>0 THEN round((responded::numeric/invited::numeric)*100,2) ELSE 0 END
  );
END $$;

CREATE OR REPLACE FUNCTION esg.freeze_report(
  _tenant uuid,
  _report uuid,
  _actor  uuid
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid;
  lock_key bigint;
  rpt record;
  fs_id uuid;
  cver integer;
  comp_pct numeric;
  comp_snap jsonb;
  supplier_cov jsonb;
  supplier_scope3 numeric;
  snap jsonb;
  mj int;
  mn int;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  lock_key := hashtextextended(_tenant::text || ':' || _report::text, 0);
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT id, period_start, period_end, version_major, version_minor, is_locked, locked
    INTO rpt
    FROM esg.reports
   WHERE id = _report
     AND tenant_id = _tenant
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found';
  END IF;

  IF COALESCE(rpt.is_locked, false) OR COALESCE(rpt.locked, false) THEN
    RAISE EXCEPTION 'report already locked' USING ERRCODE = '55000';
  END IF;

  SELECT td.factor_set_id
    INTO fs_id
    FROM esg.tenant_defaults td
   WHERE td.tenant_id = _tenant
   LIMIT 1;

  IF fs_id IS NULL THEN
    RAISE EXCEPTION 'tenant default factor set is required before freeze';
  END IF;

  SELECT COALESCE(MAX(et.calc_version), 1)
    INTO cver
    FROM esg.emission_totals et
   WHERE et.tenant_id = _tenant
     AND et.period_start = rpt.period_start
     AND et.period_end = rpt.period_end
     AND et.factor_set_id = fs_id;

  comp_pct := esg.completeness_percent(_tenant, rpt.period_start, rpt.period_end);
  supplier_cov := esg.suppliers_coverage(_tenant, rpt.period_start, rpt.period_end);
  supplier_scope3 := esg.scope3_supplier_total(_tenant, rpt.period_start, rpt.period_end);

  SELECT COALESCE(
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
    INTO comp_snap
    FROM esg.compliance_findings cf
    JOIN esg.compliance_rules cr ON cr.id = cf.rule_id
   WHERE cf.tenant_id = _tenant
     AND cf.period_start = rpt.period_start
     AND cf.period_end = rpt.period_end;

  UPDATE esg.reports
     SET version_minor = version_minor + 1,
         locked = true,
         is_locked = true,
         factor_set_id = fs_id,
         calc_version = cver,
         compliance_snapshot = comp_snap,
         completeness_percent = comp_pct,
         frozen_at = now(),
         frozen_by = _actor
   WHERE id = _report
     AND tenant_id = _tenant
  RETURNING version_major, version_minor
    INTO mj, mn;

  snap := jsonb_build_object(
    'factorSetId', fs_id,
    'calcVersion', cver,
    'completenessPercent', comp_pct,
    'complianceFindings', comp_snap,
    'supplierCoverage', supplier_cov,
    'supplierScope3', supplier_scope3,
    'lineage', esg.report_lineage(_tenant, _report)
  );

  INSERT INTO esg.report_freezes(tenant_id, report_id, version_major, version_minor, frozen_at, frozen_by, snapshot)
  VALUES (_tenant, _report, mj, mn, now(), _actor, snap)
  ON CONFLICT (tenant_id, report_id, version_major, version_minor) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION esg.recalc_emissions(
  _tenant uuid,
  _entity uuid,
  _pstart date,
  _pend date,
  _factor_set uuid
) RETURNS esg.emission_totals
LANGUAGE plpgsql AS $$
DECLARE
  ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid;
  k1 int4;
  k2 int4;
  s1 numeric := 0;
  s2_loc numeric := 0;
  s2_mkt numeric := 0;
  s3 numeric := 0;
  supplier_scope3 numeric := 0;
  is_root_org boolean := false;
  row_out esg.emission_totals%ROWTYPE;
  period_locked boolean;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM esg.reports r
     WHERE r.tenant_id = _tenant
       AND r.period_start = _pstart
       AND r.period_end = _pend
       AND r.is_locked = true
  ) INTO period_locked;

  IF period_locked THEN
    RAISE EXCEPTION 'recalculation blocked for frozen report period' USING ERRCODE = '55000';
  END IF;

  SELECT lk.k1, lk.k2 INTO k1, k2 FROM esg.calc_lock_keys(_tenant,_entity,_pstart,_pend) lk;
  PERFORM pg_advisory_xact_lock(k1, k2);

  SELECT (e.etype = 'ORG'::esg.entity_type AND e.parent_id IS NULL)
    INTO is_root_org
  FROM esg.entities e
  WHERE e.id = _entity
    AND e.tenant_id = _tenant;

  SELECT coalesce(sum(f.value * ef.loc_kgco2e_per_unit),0)
    INTO s1
    FROM esg.facts f
    JOIN esg.metrics m ON m.code=f.metric_code
    LEFT JOIN esg.emission_factors ef ON ef.factor_set_id=_factor_set AND ef.metric_code=f.metric_code
   WHERE f.tenant_id=_tenant AND f.entity_id=_entity
     AND f.period_start=_pstart AND f.period_end=_pend
     AND f.status='APPROVED' AND m.scope=1;

  SELECT coalesce(sum(f.value * ef.loc_kgco2e_per_unit),0)
    INTO s2_loc
    FROM esg.facts f
    JOIN esg.metrics m ON m.code=f.metric_code
    LEFT JOIN esg.emission_factors ef ON ef.factor_set_id=_factor_set AND ef.metric_code=f.metric_code
   WHERE f.tenant_id=_tenant AND f.entity_id=_entity
     AND f.period_start=_pstart AND f.period_end=_pend
     AND f.status='APPROVED' AND m.scope=2;

  SELECT coalesce(sum(f.value * coalesce(ef.mkt_kgco2e_per_unit, ef.loc_kgco2e_per_unit)),0)
    INTO s2_mkt
    FROM esg.facts f
    JOIN esg.metrics m ON m.code=f.metric_code
    LEFT JOIN esg.emission_factors ef ON ef.factor_set_id=_factor_set AND ef.metric_code=f.metric_code
   WHERE f.tenant_id=_tenant AND f.entity_id=_entity
     AND f.period_start=_pstart AND f.period_end=_pend
     AND f.status='APPROVED' AND m.scope=2;

  SELECT coalesce(sum(f.value * ef.loc_kgco2e_per_unit),0)
    INTO s3
    FROM esg.facts f
    JOIN esg.metrics m ON m.code=f.metric_code
    LEFT JOIN esg.emission_factors ef ON ef.factor_set_id=_factor_set AND ef.metric_code=f.metric_code
   WHERE f.tenant_id=_tenant AND f.entity_id=_entity
     AND f.period_start=_pstart AND f.period_end=_pend
     AND f.status='APPROVED' AND m.scope=3;

  IF is_root_org THEN
    supplier_scope3 := esg.scope3_supplier_total(_tenant, _pstart, _pend);
    s3 := s3 + supplier_scope3;
  END IF;

  INSERT INTO esg.emission_totals (tenant_id, entity_id, period_start, period_end, factor_set_id,
                                   scope1, scope2_loc, scope2_mkt, scope3)
  VALUES (_tenant, _entity, _pstart, _pend, _factor_set, s1, s2_loc, s2_mkt, s3)
  ON CONFLICT (tenant_id, entity_id, period_start, period_end, factor_set_id)
  DO UPDATE SET scope1=EXCLUDED.scope1, scope2_loc=EXCLUDED.scope2_loc, scope2_mkt=EXCLUDED.scope2_mkt,
                scope3=EXCLUDED.scope3, calc_version=esg.emission_totals.calc_version + 1, updated_at=now()
  RETURNING * INTO row_out;

  PERFORM esg.refresh_exec_kpi_base();

  RETURN row_out;
END $$;

DROP MATERIALIZED VIEW IF EXISTS esg.exec_kpi_base CASCADE;

CREATE MATERIALIZED VIEW esg.exec_kpi_base AS
WITH facts_agg AS (
  SELECT
    f.tenant_id,
    f.entity_id,
    f.period_start,
    f.period_end,
    COUNT(*) FILTER (WHERE f.status = 'APPROVED')::numeric AS approved_facts,
    COUNT(*)::numeric AS total_facts,
    COUNT(*) FILTER (WHERE f.status = 'APPROVED' AND COALESCE((f.quality_flags->>'outlier')::boolean, false))::numeric AS outlier_facts
  FROM esg.facts f
  GROUP BY f.tenant_id, f.entity_id, f.period_start, f.period_end
),
compliance_agg AS (
  SELECT
    cf.tenant_id,
    cf.period_start,
    cf.period_end,
    COALESCE(
      round(
        (COALESCE(SUM(cf.completeness_weight) FILTER (WHERE cf.status = 'PASS'), 0)
          / NULLIF(COALESCE(SUM(cf.completeness_weight), 0), 0)) * 100,
        2
      ),
      0
    ) AS compliance_percent
  FROM esg.compliance_findings cf
  GROUP BY cf.tenant_id, cf.period_start, cf.period_end
),
supplier_agg AS (
  SELECT
    sr.tenant_id,
    sr.period_start,
    sr.period_end,
    COALESCE(SUM(sr.emissions_kgco2e) FILTER (WHERE sr.approved = true), 0) AS scope3_supplier
  FROM esg.supplier_responses sr
  GROUP BY sr.tenant_id, sr.period_start, sr.period_end
),
coverage_agg AS (
  SELECT
    i.tenant_id,
    i.period_start,
    i.period_end,
    COUNT(*)::numeric AS invited_count,
    COUNT(DISTINCT r.supplier_id)::numeric AS responded_count
  FROM esg.supplier_invites i
  LEFT JOIN esg.supplier_responses r
    ON r.tenant_id = i.tenant_id
   AND r.supplier_id = i.supplier_id
   AND r.period_start = i.period_start
   AND r.period_end = i.period_end
  GROUP BY i.tenant_id, i.period_start, i.period_end
)
SELECT
  et.tenant_id,
  et.entity_id,
  et.period_start,
  et.period_end,
  et.factor_set_id,
  COALESCE(et.scope1, 0) AS scope1,
  COALESCE(et.scope2_loc, 0) AS scope2_loc,
  COALESCE(et.scope2_mkt, 0) AS scope2_mkt,
  COALESCE(et.scope3, 0) AS scope3,
  CASE
    WHEN e.etype = 'ORG'::esg.entity_type AND e.parent_id IS NULL THEN COALESCE(sa.scope3_supplier, 0)
    ELSE 0
  END AS scope3_supplier,
  CASE
    WHEN e.etype = 'ORG'::esg.entity_type AND e.parent_id IS NULL THEN GREATEST(COALESCE(et.scope3, 0) - COALESCE(sa.scope3_supplier, 0), 0)
    ELSE COALESCE(et.scope3, 0)
  END AS scope3_internal,
  COALESCE(et.scope1, 0) + COALESCE(et.scope2_loc, 0) + COALESCE(et.scope2_mkt, 0) + COALESCE(et.scope3, 0) AS total_emissions,
  COALESCE(ca.compliance_percent, 0) AS compliance_percent,
  COALESCE(
    round((COALESCE(fa.approved_facts, 0) / NULLIF(COALESCE(fa.total_facts, 0), 0)) * 100, 2),
    0
  ) AS approved_fact_percent,
  CASE
    WHEN COALESCE(fa.approved_facts, 0) = 0 THEN 100::numeric
    ELSE GREATEST(
      0::numeric,
      round((1 - (COALESCE(fa.outlier_facts, 0) / NULLIF(fa.approved_facts, 0))) * 100, 2)
    )
  END AS data_quality_score,
  COALESCE(
    round((COALESCE(cv.responded_count, 0) / NULLIF(COALESCE(cv.invited_count, 0), 0)) * 100, 2),
    0
  ) AS supplier_coverage_percent,
  et.calc_version
FROM esg.emission_totals et
JOIN esg.entities e
  ON e.id = et.entity_id
 AND e.tenant_id = et.tenant_id
LEFT JOIN facts_agg fa
  ON fa.tenant_id = et.tenant_id
 AND fa.entity_id = et.entity_id
 AND fa.period_start = et.period_start
 AND fa.period_end = et.period_end
LEFT JOIN compliance_agg ca
  ON ca.tenant_id = et.tenant_id
 AND ca.period_start = et.period_start
 AND ca.period_end = et.period_end
LEFT JOIN supplier_agg sa
  ON sa.tenant_id = et.tenant_id
 AND sa.period_start = et.period_start
 AND sa.period_end = et.period_end
LEFT JOIN coverage_agg cv
  ON cv.tenant_id = et.tenant_id
 AND cv.period_start = et.period_start
 AND cv.period_end = et.period_end;

CREATE UNIQUE INDEX exec_kpi_base_pk_idx
  ON esg.exec_kpi_base (tenant_id, entity_id, period_start, period_end, factor_set_id);

CREATE INDEX exec_kpi_base_tenant_period_factor_idx
  ON esg.exec_kpi_base (tenant_id, period_start, factor_set_id);

CREATE OR REPLACE FUNCTION esg.refresh_exec_kpi_base()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW esg.exec_kpi_base;
END;
$$;

CREATE OR REPLACE FUNCTION esg.get_exec_kpis(
  _tenant uuid,
  _report uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE AS $$
DECLARE
  ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid;
  rpt record;
  payload jsonb;
  prev_payload jsonb;
  prev_report_id uuid;
  prev_report_locked boolean := false;
  freeze_snapshot jsonb;
  mode text;
  calc_ver integer := 1;
  completeness numeric := 0;
  scope1 numeric := 0;
  scope2 numeric := 0;
  scope3 numeric := 0;
  scope3_internal numeric := 0;
  scope3_supplier numeric := 0;
  total_emissions numeric := 0;
  approved_percent numeric := 0;
  data_quality numeric := 100;
  supplier_coverage numeric := 0;
  intensity numeric := NULL;
  selected_factor_set_id uuid;
  prev_start date;
  prev_end date;
  prev_scope1 numeric := 0;
  prev_scope2 numeric := 0;
  prev_scope3 numeric := 0;
  prev_scope3_internal numeric := 0;
  prev_scope3_supplier numeric := 0;
  prev_total_emissions numeric := 0;
  prev_completeness numeric := NULL;
  prev_approved_percent numeric := NULL;
  prev_data_quality numeric := NULL;
  prev_supplier_coverage numeric := NULL;
  prev_intensity numeric := NULL;
  delta_scope1 numeric := NULL;
  delta_scope2 numeric := NULL;
  delta_scope3 numeric := NULL;
  delta_scope3_internal numeric := NULL;
  delta_scope3_supplier numeric := NULL;
  delta_total numeric := NULL;
  delta_completeness numeric := NULL;
  delta_approved numeric := NULL;
  delta_data_quality numeric := NULL;
  delta_supplier_coverage numeric := NULL;
  delta_intensity numeric := NULL;
  scope3_attribution text := NULL;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT
    r.id,
    r.period_start,
    r.period_end,
    COALESCE(r.is_locked, r.locked, false) AS is_locked,
    r.factor_set_id
  INTO rpt
  FROM esg.reports r
  WHERE r.id = _report
    AND r.tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found' USING ERRCODE = 'P0002';
  END IF;

  mode := CASE WHEN rpt.is_locked THEN 'snapshot' ELSE 'live' END;
  prev_start := esg.q_prev_start(rpt.period_start);
  prev_end := esg.q_end(prev_start);

  IF rpt.factor_set_id IS NULL THEN
    SELECT td.factor_set_id INTO selected_factor_set_id
    FROM esg.tenant_defaults td
    WHERE td.tenant_id = _tenant
    LIMIT 1;
  ELSE
    selected_factor_set_id := rpt.factor_set_id;
  END IF;

  IF mode = 'snapshot' THEN
    payload := esg.get_report_export_payload(_tenant, _report);
    calc_ver := COALESCE(NULLIF(payload->>'calcVersion', '')::int, 1);
    completeness := COALESCE(NULLIF(payload->>'completenessPercent', '')::numeric, 0);
    scope1 := COALESCE(NULLIF(payload #>> '{totals,s1}', '')::numeric, 0);
    scope2 := COALESCE(NULLIF(payload #>> '{totals,s2l}', '')::numeric, 0)
            + COALESCE(NULLIF(payload #>> '{totals,s2m}', '')::numeric, 0);
    scope3 := COALESCE(NULLIF(payload #>> '{totals,s3}', '')::numeric, 0);
    total_emissions := scope1 + scope2 + scope3;

    SELECT rf.snapshot
      INTO freeze_snapshot
      FROM esg.report_freezes rf
     WHERE rf.tenant_id = _tenant
       AND rf.report_id = _report
     ORDER BY rf.version_major DESC, rf.version_minor DESC
     LIMIT 1;

    scope3_supplier := COALESCE(NULLIF(freeze_snapshot #>> '{supplierScope3}', '')::numeric, 0);
    scope3_internal := GREATEST(scope3 - scope3_supplier, 0);
    supplier_coverage := COALESCE(NULLIF(freeze_snapshot #>> '{supplierCoverage,coverageByCountPercent}', '')::numeric, 0);

    SELECT
      COALESCE(MAX(b.approved_fact_percent), 0),
      COALESCE(MAX(b.data_quality_score), 100)
    INTO approved_percent, data_quality
    FROM esg.exec_kpi_base b
    WHERE b.tenant_id = _tenant
      AND b.period_start = rpt.period_start
      AND b.period_end = rpt.period_end
      AND (selected_factor_set_id IS NULL OR b.factor_set_id = selected_factor_set_id);
  ELSE
    SELECT
      COALESCE(SUM(b.scope1), 0),
      COALESCE(SUM(b.scope2_loc), 0) + COALESCE(SUM(b.scope2_mkt), 0),
      COALESCE(SUM(b.scope3), 0),
      COALESCE(SUM(b.scope3_internal), 0),
      COALESCE(MAX(b.scope3_supplier), 0),
      COALESCE(SUM(b.total_emissions), 0),
      COALESCE(MAX(b.compliance_percent), 0),
      COALESCE(MAX(b.approved_fact_percent), 0),
      COALESCE(MAX(b.data_quality_score), 100),
      COALESCE(MAX(b.supplier_coverage_percent), 0),
      COALESCE(MAX(b.calc_version), 1)
    INTO scope1, scope2, scope3, scope3_internal, scope3_supplier, total_emissions, completeness, approved_percent, data_quality, supplier_coverage, calc_ver
    FROM esg.exec_kpi_base b
    WHERE b.tenant_id = _tenant
      AND b.period_start = rpt.period_start
      AND b.period_end = rpt.period_end
      AND (selected_factor_set_id IS NULL OR b.factor_set_id = selected_factor_set_id);
  END IF;

  IF total_emissions > 0 THEN
    intensity := round(total_emissions / 1000, 6);
  END IF;

  SELECT r.id, COALESCE(r.is_locked, r.locked, false)
    INTO prev_report_id, prev_report_locked
    FROM esg.reports r
   WHERE r.tenant_id = _tenant
     AND r.period_start = prev_start
     AND r.period_end = prev_end
   ORDER BY COALESCE(r.is_locked, r.locked, false) DESC, r.updated_at DESC
   LIMIT 1;

  IF prev_report_id IS NOT NULL AND prev_report_locked THEN
    prev_payload := esg.get_report_export_payload(_tenant, prev_report_id);
    prev_scope1 := COALESCE(NULLIF(prev_payload #>> '{totals,s1}', '')::numeric, 0);
    prev_scope2 := COALESCE(NULLIF(prev_payload #>> '{totals,s2l}', '')::numeric, 0)
                 + COALESCE(NULLIF(prev_payload #>> '{totals,s2m}', '')::numeric, 0);
    prev_scope3 := COALESCE(NULLIF(prev_payload #>> '{totals,s3}', '')::numeric, 0);
    prev_total_emissions := prev_scope1 + prev_scope2 + prev_scope3;
    prev_completeness := NULLIF(prev_payload->>'completenessPercent', '')::numeric;

    SELECT rf.snapshot
      INTO freeze_snapshot
      FROM esg.report_freezes rf
     WHERE rf.tenant_id = _tenant
       AND rf.report_id = prev_report_id
     ORDER BY rf.version_major DESC, rf.version_minor DESC
     LIMIT 1;
    prev_scope3_supplier := COALESCE(NULLIF(freeze_snapshot #>> '{supplierScope3}', '')::numeric, 0);
    prev_scope3_internal := GREATEST(prev_scope3 - prev_scope3_supplier, 0);
    prev_supplier_coverage := COALESCE(NULLIF(freeze_snapshot #>> '{supplierCoverage,coverageByCountPercent}', '')::numeric, 0);
  ELSE
    SELECT
      COALESCE(SUM(b.scope1), 0),
      COALESCE(SUM(b.scope2_loc), 0) + COALESCE(SUM(b.scope2_mkt), 0),
      COALESCE(SUM(b.scope3), 0),
      COALESCE(SUM(b.scope3_internal), 0),
      COALESCE(MAX(b.scope3_supplier), 0),
      COALESCE(SUM(b.total_emissions), 0),
      COALESCE(MAX(b.compliance_percent), 0),
      COALESCE(MAX(b.approved_fact_percent), 0),
      COALESCE(MAX(b.data_quality_score), 100),
      COALESCE(MAX(b.supplier_coverage_percent), 0)
    INTO prev_scope1, prev_scope2, prev_scope3, prev_scope3_internal, prev_scope3_supplier, prev_total_emissions, prev_completeness, prev_approved_percent, prev_data_quality, prev_supplier_coverage
    FROM esg.exec_kpi_base b
    WHERE b.tenant_id = _tenant
      AND b.period_start = prev_start
      AND b.period_end = prev_end
      AND (selected_factor_set_id IS NULL OR b.factor_set_id = selected_factor_set_id);
  END IF;

  IF prev_approved_percent IS NULL THEN prev_approved_percent := approved_percent; END IF;
  IF prev_data_quality IS NULL THEN prev_data_quality := data_quality; END IF;
  IF prev_supplier_coverage IS NULL THEN prev_supplier_coverage := supplier_coverage; END IF;
  IF prev_total_emissions > 0 THEN prev_intensity := round(prev_total_emissions / 1000, 6); END IF;

  IF prev_scope1 <> 0 THEN delta_scope1 := round(((scope1 - prev_scope1) / prev_scope1) * 100, 2); END IF;
  IF prev_scope2 <> 0 THEN delta_scope2 := round(((scope2 - prev_scope2) / prev_scope2) * 100, 2); END IF;
  IF prev_scope3 <> 0 THEN delta_scope3 := round(((scope3 - prev_scope3) / prev_scope3) * 100, 2); END IF;
  IF prev_scope3_internal <> 0 THEN delta_scope3_internal := round(((scope3_internal - prev_scope3_internal) / prev_scope3_internal) * 100, 2); END IF;
  IF prev_scope3_supplier <> 0 THEN delta_scope3_supplier := round(((scope3_supplier - prev_scope3_supplier) / prev_scope3_supplier) * 100, 2); END IF;
  IF prev_total_emissions <> 0 THEN delta_total := round(((total_emissions - prev_total_emissions) / prev_total_emissions) * 100, 2); END IF;
  IF prev_completeness IS NOT NULL AND prev_completeness <> 0 THEN
    delta_completeness := round(((completeness - prev_completeness) / prev_completeness) * 100, 2);
  END IF;
  IF prev_approved_percent IS NOT NULL AND prev_approved_percent <> 0 THEN
    delta_approved := round(((approved_percent - prev_approved_percent) / prev_approved_percent) * 100, 2);
  END IF;
  IF prev_data_quality IS NOT NULL AND prev_data_quality <> 0 THEN
    delta_data_quality := round(((data_quality - prev_data_quality) / prev_data_quality) * 100, 2);
  END IF;
  IF prev_supplier_coverage IS NOT NULL AND prev_supplier_coverage <> 0 THEN
    delta_supplier_coverage := round(((supplier_coverage - prev_supplier_coverage) / prev_supplier_coverage) * 100, 2);
  END IF;
  IF intensity IS NOT NULL AND prev_intensity IS NOT NULL AND prev_intensity <> 0 THEN
    delta_intensity := round(((intensity - prev_intensity) / prev_intensity) * 100, 2);
  END IF;

  IF COALESCE(delta_total, 0) > 0
     AND COALESCE(delta_supplier_coverage, 0) > 0
     AND abs(COALESCE(delta_scope3_internal, 0)) <= 1 THEN
    scope3_attribution := 'Increase driven by coverage expansion';
  END IF;

  RETURN jsonb_build_object(
    'mode', mode,
    'reportId', _report,
    'isLocked', rpt.is_locked,
    'periodStart', rpt.period_start,
    'periodEnd', rpt.period_end,
    'calcVersion', calc_ver,
    'completenessPercent', completeness,
    'scope3Breakdown', jsonb_build_object(
      'internal', scope3_internal,
      'supplier', scope3_supplier
    ),
    'attribution', scope3_attribution,
    'kpis', jsonb_build_array(
      jsonb_build_object('name','Scope 1 total','value',scope1,'delta',delta_scope1,'status',CASE WHEN delta_scope1 IS NULL THEN 'YELLOW' WHEN delta_scope1 <=0 THEN 'GREEN' WHEN delta_scope1 <=5 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Scope 2 total','value',scope2,'delta',delta_scope2,'status',CASE WHEN delta_scope2 IS NULL THEN 'YELLOW' WHEN delta_scope2 <=0 THEN 'GREEN' WHEN delta_scope2 <=5 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Scope 3 total','value',scope3,'delta',delta_scope3,'status',CASE WHEN delta_scope3 IS NULL THEN 'YELLOW' WHEN delta_scope3 <=0 THEN 'GREEN' WHEN delta_scope3 <=5 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Scope 3 (Internal)','value',scope3_internal,'delta',delta_scope3_internal,'status',CASE WHEN delta_scope3_internal IS NULL THEN 'YELLOW' WHEN delta_scope3_internal <=0 THEN 'GREEN' WHEN delta_scope3_internal <=5 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Scope 3 (Supplier)','value',scope3_supplier,'delta',delta_scope3_supplier,'status',CASE WHEN scope3_supplier > 0 THEN 'GREEN' ELSE 'YELLOW' END),
      jsonb_build_object('name','Total emissions','value',total_emissions,'delta',delta_total,'status',CASE WHEN delta_total IS NULL THEN 'YELLOW' WHEN delta_total <=0 THEN 'GREEN' WHEN delta_total <=5 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Emissions intensity','value',intensity,'delta',delta_intensity,'status',CASE WHEN intensity IS NULL THEN 'YELLOW' WHEN delta_intensity IS NULL THEN 'YELLOW' WHEN delta_intensity <=0 THEN 'GREEN' WHEN delta_intensity <=5 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Compliance %','value',completeness,'delta',delta_completeness,'status',CASE WHEN completeness >=95 THEN 'GREEN' WHEN completeness >=80 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Data quality score','value',data_quality,'delta',delta_data_quality,'status',CASE WHEN data_quality >=98 THEN 'GREEN' WHEN data_quality >=90 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','% approved facts','value',approved_percent,'delta',delta_approved,'status',CASE WHEN approved_percent >=95 THEN 'GREEN' WHEN approved_percent >=80 THEN 'YELLOW' ELSE 'RED' END),
      jsonb_build_object('name','Supplier coverage %','value',supplier_coverage,'delta',delta_supplier_coverage,'status',CASE WHEN supplier_coverage >=95 THEN 'GREEN' WHEN supplier_coverage >=80 THEN 'YELLOW' ELSE 'RED' END)
    )
  );
END;
$$;
