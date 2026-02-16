DROP TRIGGER IF EXISTS trg_facts_block_locked_period_insert ON esg.facts;
DROP TRIGGER IF EXISTS trg_facts_block_locked_period_update ON esg.facts;
DROP TRIGGER IF EXISTS trg_facts_block_locked_period_delete ON esg.facts;
DROP FUNCTION IF EXISTS esg.facts_block_locked_period_mutation_trg();

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
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
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

  RETURN row_out;
END $$;

CREATE OR REPLACE FUNCTION esg.freeze_report(
  _tenant uuid,
  _report uuid,
  _actor  uuid
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid; mj int; mn int; snap jsonb;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;
  UPDATE esg.reports
     SET version_minor = version_minor + 1,
         locked = true,
         frozen_at = now(),
         frozen_by = _actor
   WHERE id = _report AND tenant_id = _tenant;
  SELECT version_major, version_minor INTO mj, mn FROM esg.reports WHERE id=_report AND tenant_id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'report not found'; END IF;
  snap := esg.report_lineage(_tenant, _report);
  INSERT INTO esg.report_freezes(tenant_id, report_id, version_major, version_minor, frozen_at, frozen_by, snapshot)
  VALUES (_tenant, _report, mj, mn, now(), _actor, snap)
  ON CONFLICT (tenant_id, report_id, version_major, version_minor) DO NOTHING;
END; $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_factor_set_id_fkey'
      AND conrelid = 'esg.reports'::regclass
  ) THEN
    ALTER TABLE esg.reports DROP CONSTRAINT reports_factor_set_id_fkey;
  END IF;
END $$;

ALTER TABLE esg.reports
  DROP COLUMN IF EXISTS is_locked,
  DROP COLUMN IF EXISTS completeness_percent,
  DROP COLUMN IF EXISTS compliance_snapshot,
  DROP COLUMN IF EXISTS calc_version,
  DROP COLUMN IF EXISTS factor_set_id;
