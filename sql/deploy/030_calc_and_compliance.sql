-- ========= Factor sets and factors =========
CREATE TABLE IF NOT EXISTS esg.factor_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  region text,
  version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esg.emission_factors (
  factor_set_id uuid NOT NULL REFERENCES esg.factor_sets(id) ON DELETE CASCADE,
  metric_code   text NOT NULL REFERENCES esg.metrics(code),
  unit          text NOT NULL,
  loc_kgco2e_per_unit numeric NOT NULL,
  mkt_kgco2e_per_unit numeric,
  PRIMARY KEY (factor_set_id, metric_code)
);

-- ========= Totals table =========
CREATE TABLE IF NOT EXISTS esg.emission_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES esg.entities(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  factor_set_id uuid NOT NULL REFERENCES esg.factor_sets(id) ON DELETE CASCADE,
  scope1 numeric,
  scope2_loc numeric,
  scope2_mkt numeric,
  scope3 numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_id, period_start, period_end, factor_set_id)
);

ALTER TABLE esg.emission_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS totals_tenant_read ON esg.emission_totals
  FOR SELECT USING (tenant_id = app.current_tenant());
CREATE POLICY IF NOT EXISTS totals_tenant_write ON esg.emission_totals
  FOR ALL     USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());

-- ========= Tenant default factor set =========
CREATE TABLE IF NOT EXISTS esg.tenant_defaults (
  tenant_id uuid PRIMARY KEY REFERENCES esg.tenants(id) ON DELETE CASCADE,
  factor_set_id uuid NOT NULL REFERENCES esg.factor_sets(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ========= Seed a dev factor set =========
DO $$
DECLARE fs uuid;
BEGIN
  INSERT INTO esg.factor_sets(code,name,region,version)
  VALUES ('IN-CEA-2024','India CEA 2024','IN','2024') ON CONFLICT (code) DO NOTHING;
  SELECT id INTO fs FROM esg.factor_sets WHERE code='IN-CEA-2024';
  INSERT INTO esg.emission_factors(factor_set_id, metric_code, unit, loc_kgco2e_per_unit, mkt_kgco2e_per_unit)
  VALUES (fs, 'ELEC_KWH', 'kWh', 0.70, 0.70)
  ON CONFLICT (factor_set_id, metric_code) DO NOTHING;
END $$;

-- ========= Helper: advisory lock key =========
CREATE OR REPLACE FUNCTION esg.calc_lock_keys(_tenant uuid, _entity uuid, _pstart date, _pend date)
RETURNS TABLE (k1 int4, k2 int4)
LANGUAGE sql IMMUTABLE AS $$
  SELECT hashtext(_tenant::text) AS k1,
         hashtext(_entity::text||'|'||_pstart::text||'|'||_pend::text) AS k2;
$$;

-- ========= Proc: esg.recalc_emissions =========
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
  k1 int4; k2 int4;
  s1 numeric := 0; s2_loc numeric := 0; s2_mkt numeric := 0; s3 numeric := 0;
  row_out esg.emission_totals%ROWTYPE;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT k1,k2 INTO k1,k2 FROM esg.calc_lock_keys(_tenant,_entity,_pstart,_pend);
  PERFORM pg_advisory_lock(k1, k2);

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
                scope3=EXCLUDED.scope3, updated_at=now()
  RETURNING * INTO row_out;

  PERFORM pg_advisory_unlock(k1, k2);
  RETURN row_out;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(k1, k2);
  RAISE;
END $$;

CREATE OR REPLACE FUNCTION esg.totals_before_upd_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_totals_before_upd ON esg.emission_totals;
CREATE TRIGGER trg_totals_before_upd BEFORE UPDATE ON esg.emission_totals
  FOR EACH ROW EXECUTE FUNCTION esg.totals_before_upd_trg();


