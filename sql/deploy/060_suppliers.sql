DO $$ BEGIN
  CREATE TYPE esg.supplier_status AS ENUM ('INVITED','RESPONDED','DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE esg.response_status AS ENUM ('DRAFT','SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS esg.suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       citext NOT NULL,
  category    text NOT NULL,
  spend       numeric NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'INR',
  status      esg.supplier_status NOT NULL DEFAULT 'INVITED',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS esg.supplier_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES esg.suppliers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  invited_email citext NOT NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esg.supplier_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES esg.suppliers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       esg.response_status NOT NULL DEFAULT 'SUBMITTED',
  emissions_kgco2e numeric,
  activity     jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, period_start, period_end)
);

ALTER TABLE esg.suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.supplier_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.supplier_responses  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='suppliers' AND policyname='suppliers_rls') THEN
    CREATE POLICY suppliers_rls   ON esg.suppliers          FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='supplier_invites' AND policyname='invites_rls') THEN
    CREATE POLICY invites_rls     ON esg.supplier_invites   FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='supplier_responses' AND policyname='responses_rls') THEN
    CREATE POLICY responses_rls   ON esg.supplier_responses FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION esg.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_suppliers_touch ON esg.suppliers;
CREATE TRIGGER trg_suppliers_touch BEFORE UPDATE ON esg.suppliers
  FOR EACH ROW EXECUTE FUNCTION esg.touch_updated_at();

CREATE OR REPLACE FUNCTION esg.suppliers_coverage(_tenant uuid, _pstart date, _pend date)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE spend_total numeric := 0; spend_cov numeric := 0; invited int := 0; responded int := 0;
BEGIN
  SELECT COALESCE(SUM(s.spend),0), COUNT(*) INTO spend_total, invited
  FROM esg.supplier_invites i JOIN esg.suppliers s ON s.id=i.supplier_id
  WHERE i.tenant_id=_tenant AND i.period_start=_pstart AND i.period_end=_pend;
  SELECT COALESCE(SUM(s.spend),0), COUNT(DISTINCT r.supplier_id) INTO spend_cov, responded
  FROM esg.supplier_responses r JOIN esg.suppliers s ON s.id=r.supplier_id
  WHERE r.tenant_id=_tenant AND r.period_start=_pstart AND r.period_end=_pend;
  RETURN jsonb_build_object('invited', invited, 'responded', responded, 'spendTotal', spend_total, 'spendCovered', spend_cov,
    'coveragePercent', CASE WHEN spend_total>0 THEN round((spend_cov/spend_total)*100,2) ELSE 0 END);
END $$;

CREATE OR REPLACE FUNCTION esg.suppliers_category_rollup(_tenant uuid, _pstart date, _pend date)
RETURNS TABLE (category text, suppliers int, spend numeric, emissions_kgco2e numeric)
LANGUAGE sql STABLE AS $$
  SELECT s.category, COUNT(DISTINCT r.supplier_id) AS suppliers, COALESCE(SUM(s.spend),0) AS spend,
         COALESCE(SUM(r.emissions_kgco2e),0) AS emissions_kgco2e
  FROM esg.suppliers s
  LEFT JOIN esg.supplier_responses r ON r.tenant_id=s.tenant_id AND r.supplier_id=s.id AND r.period_start=_pstart AND r.period_end=_pend
  WHERE s.tenant_id=_tenant
  GROUP BY s.category
  ORDER BY s.category;
$$;


