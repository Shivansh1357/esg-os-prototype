-- Types
DO $$ BEGIN
  CREATE TYPE esg.fact_status AS ENUM ('DRAFT','APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parent table (partitioned by quarter via period_start ranges)
CREATE TABLE IF NOT EXISTS esg.facts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  entity_id     uuid NOT NULL REFERENCES esg.entities(id) ON DELETE CASCADE,
  metric_code   text NOT NULL REFERENCES esg.metrics(code),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  value         numeric NOT NULL,
  unit          text NOT NULL,
  source_type   text,
  source_ref    text,
  status        esg.fact_status NOT NULL DEFAULT 'DRAFT',
  quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_id, metric_code, period_start, period_end)
) PARTITION BY RANGE (period_start);

-- Audit table
CREATE TABLE IF NOT EXISTS esg.facts_audit (
  id          bigserial PRIMARY KEY,
  fact_id     uuid NOT NULL,
  tenant_id   uuid NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,                  -- 'INSERT'|'UPDATE'|'APPROVE'
  at          timestamptz NOT NULL DEFAULT now(),
  before_row  jsonb,
  after_row   jsonb
);

-- RLS
ALTER TABLE esg.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.facts_audit ENABLE ROW LEVEL SECURITY;

-- Facts: only rows for current tenant visible/mutable
CREATE POLICY IF NOT EXISTS facts_tenant_read  ON esg.facts      FOR SELECT USING (tenant_id = app.current_tenant());
CREATE POLICY IF NOT EXISTS facts_tenant_write ON esg.facts      FOR ALL     USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());

-- Audit readable by same tenant; inserts happen via trigger with SET LOCAL
CREATE POLICY IF NOT EXISTS facts_audit_read   ON esg.facts_audit FOR SELECT USING (tenant_id = app.current_tenant());
CREATE POLICY IF NOT EXISTS facts_audit_write  ON esg.facts_audit FOR INSERT WITH CHECK (tenant_id = app.current_tenant());

-- Quarter helpers
CREATE OR REPLACE FUNCTION esg.q_start(d date) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT date_trunc('quarter', d)::date
$$;

CREATE OR REPLACE FUNCTION esg.q_next(d date) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (date_trunc('quarter', d) + interval '3 months')::date
$$;

-- Auto-create partition for quarter if missing
CREATE OR REPLACE FUNCTION esg.ensure_facts_partition(d date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  q0 date := esg.q_start(d);
  q1 date := esg.q_next(d);
  part text := format('facts_%sq%s', extract(year from q0)::int, extract(quarter from q0)::int);
  full text := format('esg.%I', part);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='esg' AND c.relname=part) THEN
    EXECUTE format($sql$
      CREATE TABLE %s PARTITION OF esg.facts
      FOR VALUES FROM (%L) TO (%L);
      CREATE INDEX %I_tenant_metric ON %s (tenant_id, entity_id, metric_code, period_start, period_end);
      CREATE INDEX %I_status ON %s (tenant_id, status, period_start);
    $sql$, full, q0, q1, part, full, part, full);
  END IF;
END $$;

-- BEFORE INSERT trigger: ensure partition and timestamps
CREATE OR REPLACE FUNCTION esg.facts_before_ins_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM esg.ensure_facts_partition(NEW.period_start);
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- BEFORE UPDATE timestamps
CREATE OR REPLACE FUNCTION esg.facts_before_upd_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- AFTER INSERT/UPDATE audit trail
CREATE OR REPLACE FUNCTION esg.facts_audit_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := app.current_user_id();
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := 'INSERT';
    INSERT INTO esg.facts_audit(fact_id, tenant_id, actor_id, action, before_row, after_row)
      VALUES (NEW.id, NEW.tenant_id, actor, act, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    act := CASE WHEN NEW.status='APPROVED' AND OLD.status <> 'APPROVED' THEN 'APPROVE' ELSE 'UPDATE' END;
    INSERT INTO esg.facts_audit(fact_id, tenant_id, actor_id, action, before_row, after_row)
      VALUES (NEW.id, NEW.tenant_id, actor, act, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_facts_before_ins ON esg.facts;
CREATE TRIGGER trg_facts_before_ins BEFORE INSERT ON esg.facts
  FOR EACH ROW EXECUTE FUNCTION esg.facts_before_ins_trg();

DROP TRIGGER IF EXISTS trg_facts_before_upd ON esg.facts;
CREATE TRIGGER trg_facts_before_upd BEFORE UPDATE ON esg.facts
  FOR EACH ROW EXECUTE FUNCTION esg.facts_before_upd_trg();

DROP TRIGGER IF EXISTS trg_facts_audit ON esg.facts;
CREATE TRIGGER trg_facts_audit AFTER INSERT OR UPDATE ON esg.facts
  FOR EACH ROW EXECUTE FUNCTION esg.facts_audit_trg();

-- ========== Stored Procedure: esg.upsert_fact(...) ==========
-- Enforces: tenant isolation, unit match, idempotent by (tenant, entity, metric, pstart, pend)
-- Flags 3σ outliers into quality_flags->'outlier'
CREATE OR REPLACE FUNCTION esg.upsert_fact(
  _tenant      uuid,
  _entity      uuid,
  _metric      text,
  _pstart      date,
  _pend        date,
  _value       numeric,
  _unit        text,
  _source_type text,
  _source_ref  text,
  _actor       uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  id_out uuid;
  ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid;
  m_unit text;
  mu numeric;
  sd numeric;
  is_outlier boolean := false;
  existing esg.facts%ROWTYPE;
BEGIN
  -- Context guard
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  -- Metric unit enforcement
  SELECT unit INTO m_unit FROM esg.metrics WHERE code = _metric;
  IF m_unit IS NULL THEN
    RAISE EXCEPTION 'unknown metric %', _metric;
  END IF;
  IF m_unit <> _unit THEN
    RAISE EXCEPTION 'invalid unit for metric %, expected % got %', _metric, m_unit, _unit;
  END IF;

  -- Basic sanity
  IF _pstart > _pend THEN
    RAISE EXCEPTION 'period_start > period_end';
  END IF;

  -- Outlier check over last 8 quarters for same entity+metric (APPROVED + DRAFT)
  SELECT avg(value), stddev_pop(value) INTO mu, sd
  FROM esg.facts
  WHERE tenant_id = _tenant AND entity_id = _entity AND metric_code = _metric
    AND period_start >= (_pstart - interval '24 months')::date
    AND period_start < _pstart;

  IF sd IS NOT NULL AND sd > 0 AND abs(_value - mu) > 3*sd THEN
    is_outlier := true;
  END IF;

  -- Idempotent UPSERT with row lock
  SELECT * INTO existing
  FROM esg.facts
  WHERE tenant_id=_tenant AND entity_id=_entity AND metric_code=_metric
    AND period_start=_pstart AND period_end=_pend
  FOR UPDATE;

  IF FOUND THEN
    -- If same value/unit/source, return existing id; else update (reset to DRAFT)
    IF existing.value = _value AND existing.unit = _unit
       AND coalesce(existing.source_type,'') = coalesce(_source_type,'')
       AND coalesce(existing.source_ref,'')  = coalesce(_source_ref,'') THEN
      id_out := existing.id;
      RETURN id_out;
    ELSE
      UPDATE esg.facts
      SET value = _value,
          unit = _unit,
          source_type = _source_type,
          source_ref = _source_ref,
          status = 'DRAFT',
          quality_flags = CASE WHEN is_outlier THEN jsonb_set(coalesce(existing.quality_flags,'{}'::jsonb), '{outlier}', 'true'::jsonb, true)
                               ELSE coalesce(existing.quality_flags,'{}'::jsonb) - 'outlier' END
      WHERE id = existing.id
      RETURNING id INTO id_out;
      RETURN id_out;
    END IF;
  ELSE
    INSERT INTO esg.facts
      (tenant_id, entity_id, metric_code, period_start, period_end, value, unit, source_type, source_ref, status, quality_flags)
    VALUES
      (_tenant, _entity, _metric, _pstart, _pend, _value, _unit, _source_type, _source_ref, 'DRAFT',
       CASE WHEN is_outlier THEN jsonb_build_object('outlier', true) ELSE '{}'::jsonb END)
    RETURNING id INTO id_out;
    RETURN id_out;
  END IF;
END $$;


