CREATE MATERIALIZED VIEW IF NOT EXISTS esg.exec_kpi_base AS
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
  et.calc_version
FROM esg.emission_totals et
LEFT JOIN facts_agg fa
  ON fa.tenant_id = et.tenant_id
 AND fa.entity_id = et.entity_id
 AND fa.period_start = et.period_start
 AND fa.period_end = et.period_end
LEFT JOIN compliance_agg ca
  ON ca.tenant_id = et.tenant_id
 AND ca.period_start = et.period_start
 AND ca.period_end = et.period_end;

CREATE UNIQUE INDEX IF NOT EXISTS exec_kpi_base_pk_idx
  ON esg.exec_kpi_base (tenant_id, entity_id, period_start, period_end, factor_set_id);

CREATE INDEX IF NOT EXISTS exec_kpi_base_tenant_period_factor_idx
  ON esg.exec_kpi_base (tenant_id, period_start, factor_set_id);

CREATE OR REPLACE FUNCTION esg.refresh_exec_kpi_base()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW esg.exec_kpi_base;
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

CREATE OR REPLACE FUNCTION esg.evaluate_brsr(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  ctx_tenant uuid := app.current_tenant();
  locked_key bigint;
  r record;
  prior_evidence text;
  pass_metric boolean;
  pass_evidence boolean;
  finding_status esg.finding_status;
  finding_reason text;
  finding_severity smallint;
  pass_count int := 0;
  fail_count int := 0;
  risk_count int := 0;
  total_count int := 0;
  out jsonb;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  locked_key := hashtextextended(_tenant::text || ':' || _pstart::text || ':' || _pend::text, 0);
  PERFORM pg_advisory_xact_lock(locked_key);

  FOR r IN
    SELECT id, code, framework, description, metric_code, requires_evidence, severity_level
    FROM esg.compliance_rules
    WHERE active = true AND framework = 'BRSR_CORE'
    ORDER BY code
  LOOP
    total_count := total_count + 1;

    SELECT evidence_url
      INTO prior_evidence
      FROM esg.compliance_findings
     WHERE tenant_id = _tenant
       AND rule_id = r.id
       AND period_start = _pstart
       AND period_end = _pend;

    IF r.metric_code IS NULL THEN
      pass_metric := true;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM esg.facts f
        WHERE f.tenant_id = _tenant
          AND f.period_start = _pstart
          AND f.period_end = _pend
          AND f.status = 'APPROVED'
          AND f.metric_code = r.metric_code
      ) INTO pass_metric;
    END IF;

    IF r.requires_evidence THEN
      pass_evidence := COALESCE(NULLIF(prior_evidence, ''), '') <> '';
    ELSE
      pass_evidence := true;
    END IF;

    IF pass_metric AND pass_evidence THEN
      finding_status := 'PASS';
      finding_reason := 'Rule satisfied';
      pass_count := pass_count + 1;
    ELSE
      finding_status := 'FAIL';
      finding_reason := CASE
        WHEN NOT pass_metric AND r.metric_code IS NOT NULL AND r.requires_evidence THEN 'Missing approved metric and evidence'
        WHEN NOT pass_metric AND r.metric_code IS NOT NULL THEN format('Missing approved %s', r.metric_code)
        WHEN NOT pass_evidence THEN 'Evidence missing'
        ELSE 'Rule failed'
      END;
      fail_count := fail_count + 1;
    END IF;

    finding_severity := CASE r.severity_level
      WHEN 'HIGH' THEN 5
      WHEN 'MEDIUM' THEN 3
      ELSE 1
    END;

    INSERT INTO esg.compliance_findings (
      tenant_id,
      rule_id,
      rule_code,
      period_start,
      period_end,
      status,
      severity,
      reason,
      data,
      evidence_url,
      completeness_weight,
      last_evaluated_at
    )
    VALUES (
      _tenant,
      r.id,
      r.code,
      _pstart,
      _pend,
      finding_status,
      finding_severity,
      finding_reason,
      jsonb_build_object(
        'framework', r.framework,
        'description', r.description,
        'metricCode', r.metric_code,
        'requiresEvidence', r.requires_evidence
      ),
      prior_evidence,
      1,
      now()
    )
    ON CONFLICT (tenant_id, rule_id, period_start, period_end)
    DO UPDATE SET
      rule_code = EXCLUDED.rule_code,
      status = EXCLUDED.status,
      severity = EXCLUDED.severity,
      reason = EXCLUDED.reason,
      data = EXCLUDED.data,
      completeness_weight = EXCLUDED.completeness_weight,
      last_evaluated_at = EXCLUDED.last_evaluated_at,
      updated_at = now();
  END LOOP;

  out := jsonb_build_object(
    'total', total_count,
    'pass', pass_count,
    'fail', fail_count,
    'risk', risk_count,
    'completeness', esg.completeness_percent(_tenant, _pstart, _pend)
  );

  PERFORM esg.refresh_exec_kpi_base();

  RETURN out;
END $$;

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
  mode text;
  is_locked boolean;
  calc_ver integer := 1;
  completeness numeric := 0;
  scope1 numeric := 0;
  scope2 numeric := 0;
  scope3 numeric := 0;
  total_emissions numeric := 0;
  approved_percent numeric := 0;
  data_quality numeric := 100;
  intensity numeric := NULL;
  selected_factor_set_id uuid;
  prev_start date;
  prev_end date;
  prev_scope1 numeric := 0;
  prev_scope2 numeric := 0;
  prev_scope3 numeric := 0;
  prev_total_emissions numeric := 0;
  prev_completeness numeric := NULL;
  prev_approved_percent numeric := NULL;
  prev_data_quality numeric := NULL;
  prev_intensity numeric := NULL;
  delta_scope1 numeric := NULL;
  delta_scope2 numeric := NULL;
  delta_scope3 numeric := NULL;
  delta_total numeric := NULL;
  delta_completeness numeric := NULL;
  delta_approved numeric := NULL;
  delta_data_quality numeric := NULL;
  delta_intensity numeric := NULL;
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
  is_locked := rpt.is_locked;
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

    SELECT
      COALESCE(MAX(approved_fact_percent), 0),
      COALESCE(MAX(data_quality_score), 100)
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
      COALESCE(SUM(b.total_emissions), 0),
      COALESCE(MAX(b.compliance_percent), 0),
      COALESCE(MAX(b.approved_fact_percent), 0),
      COALESCE(MAX(b.data_quality_score), 100),
      COALESCE(MAX(b.calc_version), 1)
    INTO scope1, scope2, scope3, total_emissions, completeness, approved_percent, data_quality, calc_ver
    FROM esg.exec_kpi_base b
    WHERE b.tenant_id = _tenant
      AND b.period_start = rpt.period_start
      AND b.period_end = rpt.period_end
      AND (selected_factor_set_id IS NULL OR b.factor_set_id = selected_factor_set_id);
  END IF;

  IF total_emissions > 0 THEN
    intensity := round(total_emissions / 1000, 6);
  END IF;

  SELECT r.id
    INTO prev_report_id
    FROM esg.reports r
   WHERE r.tenant_id = _tenant
     AND r.period_start = prev_start
     AND r.period_end = prev_end
   ORDER BY COALESCE(r.is_locked, r.locked, false) DESC, r.updated_at DESC
   LIMIT 1;

  IF prev_report_id IS NOT NULL
     AND EXISTS (
      SELECT 1
      FROM esg.reports r
      WHERE r.id = prev_report_id
        AND COALESCE(r.is_locked, r.locked, false)
     ) THEN
    prev_payload := esg.get_report_export_payload(_tenant, prev_report_id);
    prev_scope1 := COALESCE(NULLIF(prev_payload #>> '{totals,s1}', '')::numeric, 0);
    prev_scope2 := COALESCE(NULLIF(prev_payload #>> '{totals,s2l}', '')::numeric, 0)
                 + COALESCE(NULLIF(prev_payload #>> '{totals,s2m}', '')::numeric, 0);
    prev_scope3 := COALESCE(NULLIF(prev_payload #>> '{totals,s3}', '')::numeric, 0);
    prev_total_emissions := prev_scope1 + prev_scope2 + prev_scope3;
    prev_completeness := NULLIF(prev_payload->>'completenessPercent', '')::numeric;
  ELSE
    SELECT
      COALESCE(SUM(b.scope1), 0),
      COALESCE(SUM(b.scope2_loc), 0) + COALESCE(SUM(b.scope2_mkt), 0),
      COALESCE(SUM(b.scope3), 0),
      COALESCE(SUM(b.total_emissions), 0),
      COALESCE(MAX(b.compliance_percent), 0),
      COALESCE(MAX(b.approved_fact_percent), 0),
      COALESCE(MAX(b.data_quality_score), 100)
    INTO prev_scope1, prev_scope2, prev_scope3, prev_total_emissions, prev_completeness, prev_approved_percent, prev_data_quality
    FROM esg.exec_kpi_base b
    WHERE b.tenant_id = _tenant
      AND b.period_start = prev_start
      AND b.period_end = prev_end
      AND (selected_factor_set_id IS NULL OR b.factor_set_id = selected_factor_set_id);
  END IF;

  IF prev_approved_percent IS NULL THEN
    prev_approved_percent := approved_percent;
  END IF;
  IF prev_data_quality IS NULL THEN
    prev_data_quality := data_quality;
  END IF;
  IF prev_total_emissions > 0 THEN
    prev_intensity := round(prev_total_emissions / 1000, 6);
  END IF;

  IF prev_scope1 <> 0 THEN
    delta_scope1 := round(((scope1 - prev_scope1) / prev_scope1) * 100, 2);
  END IF;
  IF prev_scope2 <> 0 THEN
    delta_scope2 := round(((scope2 - prev_scope2) / prev_scope2) * 100, 2);
  END IF;
  IF prev_scope3 <> 0 THEN
    delta_scope3 := round(((scope3 - prev_scope3) / prev_scope3) * 100, 2);
  END IF;
  IF prev_total_emissions <> 0 THEN
    delta_total := round(((total_emissions - prev_total_emissions) / prev_total_emissions) * 100, 2);
  END IF;
  IF prev_completeness IS NOT NULL AND prev_completeness <> 0 THEN
    delta_completeness := round(((completeness - prev_completeness) / prev_completeness) * 100, 2);
  END IF;
  IF prev_approved_percent IS NOT NULL AND prev_approved_percent <> 0 THEN
    delta_approved := round(((approved_percent - prev_approved_percent) / prev_approved_percent) * 100, 2);
  END IF;
  IF prev_data_quality IS NOT NULL AND prev_data_quality <> 0 THEN
    delta_data_quality := round(((data_quality - prev_data_quality) / prev_data_quality) * 100, 2);
  END IF;
  IF intensity IS NOT NULL AND prev_intensity IS NOT NULL AND prev_intensity <> 0 THEN
    delta_intensity := round(((intensity - prev_intensity) / prev_intensity) * 100, 2);
  END IF;

  RETURN jsonb_build_object(
    'mode', mode,
    'reportId', _report,
    'isLocked', is_locked,
    'periodStart', rpt.period_start,
    'periodEnd', rpt.period_end,
    'calcVersion', calc_ver,
    'completenessPercent', completeness,
    'kpis', jsonb_build_array(
      jsonb_build_object(
        'name', 'Scope 1 total',
        'value', scope1,
        'delta', delta_scope1,
        'status', CASE
          WHEN delta_scope1 IS NULL THEN 'YELLOW'
          WHEN delta_scope1 <= 0 THEN 'GREEN'
          WHEN delta_scope1 <= 5 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', 'Scope 2 total',
        'value', scope2,
        'delta', delta_scope2,
        'status', CASE
          WHEN delta_scope2 IS NULL THEN 'YELLOW'
          WHEN delta_scope2 <= 0 THEN 'GREEN'
          WHEN delta_scope2 <= 5 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', 'Scope 3 total',
        'value', scope3,
        'delta', delta_scope3,
        'status', CASE
          WHEN delta_scope3 IS NULL THEN 'YELLOW'
          WHEN delta_scope3 <= 0 THEN 'GREEN'
          WHEN delta_scope3 <= 5 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', 'Total emissions',
        'value', total_emissions,
        'delta', delta_total,
        'status', CASE
          WHEN delta_total IS NULL THEN 'YELLOW'
          WHEN delta_total <= 0 THEN 'GREEN'
          WHEN delta_total <= 5 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', 'Emissions intensity',
        'value', intensity,
        'delta', delta_intensity,
        'status', CASE
          WHEN intensity IS NULL THEN 'YELLOW'
          WHEN delta_intensity IS NULL THEN 'YELLOW'
          WHEN delta_intensity <= 0 THEN 'GREEN'
          WHEN delta_intensity <= 5 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', 'Compliance %',
        'value', completeness,
        'delta', delta_completeness,
        'status', CASE
          WHEN completeness >= 95 THEN 'GREEN'
          WHEN completeness >= 80 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', 'Data quality score',
        'value', data_quality,
        'delta', delta_data_quality,
        'status', CASE
          WHEN data_quality >= 98 THEN 'GREEN'
          WHEN data_quality >= 90 THEN 'YELLOW'
          ELSE 'RED'
        END
      ),
      jsonb_build_object(
        'name', '% approved facts',
        'value', approved_percent,
        'delta', delta_approved,
        'status', CASE
          WHEN approved_percent >= 95 THEN 'GREEN'
          WHEN approved_percent >= 80 THEN 'YELLOW'
          ELSE 'RED'
        END
      )
    )
  );
END;
$$;
