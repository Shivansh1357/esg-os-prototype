ALTER TABLE esg.reports
  ADD COLUMN IF NOT EXISTS factor_set_id uuid,
  ADD COLUMN IF NOT EXISTS calc_version integer,
  ADD COLUMN IF NOT EXISTS compliance_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS completeness_percent numeric,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_factor_set_id_fkey'
      AND conrelid = 'esg.reports'::regclass
  ) THEN
    ALTER TABLE esg.reports
      ADD CONSTRAINT reports_factor_set_id_fkey
      FOREIGN KEY (factor_set_id) REFERENCES esg.factor_sets(id);
  END IF;
END $$;

UPDATE esg.reports
   SET is_locked = true
 WHERE locked = true
   AND is_locked = false;

CREATE OR REPLACE FUNCTION esg.facts_block_locked_period_mutation_trg()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  check_tenant uuid;
  check_pstart date;
  check_pend date;
  period_locked boolean;
BEGIN
  check_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  check_pstart := COALESCE(NEW.period_start, OLD.period_start);
  check_pend := COALESCE(NEW.period_end, OLD.period_end);

  SELECT EXISTS (
    SELECT 1
      FROM esg.reports r
     WHERE r.tenant_id = check_tenant
       AND r.period_start = check_pstart
       AND r.period_end = check_pend
       AND r.is_locked = true
  ) INTO period_locked;

  IF period_locked THEN
    RAISE EXCEPTION 'facts are immutable for frozen report periods'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_facts_block_locked_period_insert ON esg.facts;
DROP TRIGGER IF EXISTS trg_facts_block_locked_period_update ON esg.facts;
DROP TRIGGER IF EXISTS trg_facts_block_locked_period_delete ON esg.facts;

CREATE TRIGGER trg_facts_block_locked_period_insert
BEFORE INSERT ON esg.facts
FOR EACH ROW
EXECUTE FUNCTION esg.facts_block_locked_period_mutation_trg();

CREATE TRIGGER trg_facts_block_locked_period_update
BEFORE UPDATE ON esg.facts
FOR EACH ROW
EXECUTE FUNCTION esg.facts_block_locked_period_mutation_trg();

CREATE TRIGGER trg_facts_block_locked_period_delete
BEFORE DELETE ON esg.facts
FOR EACH ROW
EXECUTE FUNCTION esg.facts_block_locked_period_mutation_trg();

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

  RETURN row_out;
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
    'lineage', esg.report_lineage(_tenant, _report)
  );

  INSERT INTO esg.report_freezes(tenant_id, report_id, version_major, version_minor, frozen_at, frozen_by, snapshot)
  VALUES (_tenant, _report, mj, mn, now(), _actor, snap)
  ON CONFLICT (tenant_id, report_id, version_major, version_minor) DO NOTHING;
END;
$$;
