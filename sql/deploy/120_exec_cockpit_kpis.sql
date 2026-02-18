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
  cur_period_start date;
  cur_period_end date;
  prev_start date;
  prev_end date;
  selected_factor_set_id uuid;
  mode text;
  is_locked boolean;
  calc_ver integer;
  completeness numeric;
  scope1 numeric := 0;
  scope2 numeric := 0;
  scope3 numeric := 0;
  total_emissions numeric := 0;
  approved_count integer := 0;
  all_facts_count integer := 0;
  outlier_count integer := 0;
  approved_percent numeric := 0;
  data_quality numeric := 100;
  production_total numeric := 0;
  intensity numeric := NULL;
  prev_scope1 numeric := 0;
  prev_scope2 numeric := 0;
  prev_scope3 numeric := 0;
  prev_total_emissions numeric := 0;
  prev_completeness numeric := NULL;
  prev_approved_percent numeric := NULL;
  prev_data_quality numeric := NULL;
  delta_scope1 numeric := NULL;
  delta_scope2 numeric := NULL;
  delta_scope3 numeric := NULL;
  delta_total numeric := NULL;
  delta_completeness numeric := NULL;
  delta_approved numeric := NULL;
  delta_data_quality numeric := NULL;
  delta_intensity numeric := NULL;
  prev_production numeric := 0;
  prev_intensity numeric := NULL;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT r.id, r.period_start, r.period_end, COALESCE(r.is_locked, r.locked, false) AS is_locked
    INTO rpt
    FROM esg.reports r
   WHERE r.id = _report
     AND r.tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found' USING ERRCODE = 'P0002';
  END IF;

  payload := esg.get_report_export_payload(_tenant, _report);
  cur_period_start := rpt.period_start;
  cur_period_end := rpt.period_end;
  prev_start := esg.q_prev_start(cur_period_start);
  prev_end := esg.q_end(prev_start);
  mode := COALESCE(payload->>'mode', 'live');
  is_locked := rpt.is_locked;
  calc_ver := COALESCE(NULLIF(payload->>'calcVersion', '')::int, 1);
  completeness := COALESCE(NULLIF(payload->>'completenessPercent', '')::numeric, 0);
  scope1 := COALESCE(NULLIF(payload #>> '{totals,s1}', '')::numeric, 0);
  scope2 := COALESCE(NULLIF(payload #>> '{totals,s2l}', '')::numeric, 0)
          + COALESCE(NULLIF(payload #>> '{totals,s2m}', '')::numeric, 0);
  scope3 := COALESCE(NULLIF(payload #>> '{totals,s3}', '')::numeric, 0);
  total_emissions := scope1 + scope2 + scope3;
  outlier_count := COALESCE(NULLIF(payload->>'outlierCount', '')::int, 0);
  selected_factor_set_id := NULLIF(payload #>> '{factorSet,id}', '')::uuid;

  SELECT COUNT(*) FILTER (WHERE status = 'APPROVED')::int,
         COUNT(*)::int,
         COALESCE(SUM(value) FILTER (WHERE status = 'APPROVED' AND metric_code = 'PROD_OUTPUT'), 0)
    INTO approved_count, all_facts_count, production_total
   FROM esg.facts
   WHERE tenant_id = _tenant
     AND facts.period_start = cur_period_start
     AND facts.period_end = cur_period_end;

  IF all_facts_count > 0 THEN
    approved_percent := round((approved_count::numeric / all_facts_count::numeric) * 100, 2);
  ELSE
    approved_percent := 0;
  END IF;

  IF approved_count > 0 THEN
    data_quality := greatest(0, round((1 - (outlier_count::numeric / approved_count::numeric)) * 100, 2));
  ELSE
    data_quality := 100;
  END IF;

  IF production_total > 0 THEN
    intensity := round(total_emissions / production_total, 6);
  END IF;

  SELECT r.id
    INTO prev_report_id
    FROM esg.reports r
   WHERE r.tenant_id = _tenant
     AND r.period_start = prev_start
     AND r.period_end = prev_end
   ORDER BY COALESCE(r.is_locked, r.locked, false) DESC, r.updated_at DESC
   LIMIT 1;

  IF prev_report_id IS NOT NULL THEN
    prev_payload := esg.get_report_export_payload(_tenant, prev_report_id);
    prev_scope1 := COALESCE(NULLIF(prev_payload #>> '{totals,s1}', '')::numeric, 0);
    prev_scope2 := COALESCE(NULLIF(prev_payload #>> '{totals,s2l}', '')::numeric, 0)
                 + COALESCE(NULLIF(prev_payload #>> '{totals,s2m}', '')::numeric, 0);
    prev_scope3 := COALESCE(NULLIF(prev_payload #>> '{totals,s3}', '')::numeric, 0);
    prev_total_emissions := prev_scope1 + prev_scope2 + prev_scope3;
    prev_completeness := NULLIF(prev_payload->>'completenessPercent', '')::numeric;
    outlier_count := COALESCE(NULLIF(prev_payload->>'outlierCount', '')::int, 0);

    SELECT COUNT(*) FILTER (WHERE status = 'APPROVED')::int,
           COUNT(*)::int,
           COALESCE(SUM(value) FILTER (WHERE status = 'APPROVED' AND metric_code = 'PROD_OUTPUT'), 0)
      INTO approved_count, all_facts_count, prev_production
      FROM esg.facts
     WHERE tenant_id = _tenant
       AND facts.period_start = prev_start
       AND facts.period_end = prev_end;

    IF all_facts_count > 0 THEN
      prev_approved_percent := round((approved_count::numeric / all_facts_count::numeric) * 100, 2);
    ELSE
      prev_approved_percent := 0;
    END IF;

    IF approved_count > 0 THEN
      prev_data_quality := greatest(0, round((1 - (outlier_count::numeric / approved_count::numeric)) * 100, 2));
    ELSE
      prev_data_quality := 100;
    END IF;
    IF prev_production > 0 THEN
      prev_intensity := round(prev_total_emissions / prev_production, 6);
    END IF;
  ELSE
    SELECT COALESCE(SUM(emission_totals.scope1),0),
           COALESCE(SUM(emission_totals.scope2_loc),0) + COALESCE(SUM(emission_totals.scope2_mkt),0),
           COALESCE(SUM(emission_totals.scope3),0)
      INTO prev_scope1, prev_scope2, prev_scope3
      FROM esg.emission_totals
     WHERE emission_totals.tenant_id = _tenant
       AND emission_totals.period_start = prev_start
       AND emission_totals.period_end = prev_end
       AND (
         selected_factor_set_id IS NULL
         OR emission_totals.factor_set_id = selected_factor_set_id
       );
    prev_total_emissions := prev_scope1 + prev_scope2 + prev_scope3;
    prev_completeness := esg.completeness_percent(_tenant, prev_start, prev_end);
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
    'periodStart', cur_period_start,
    'periodEnd', cur_period_end,
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
