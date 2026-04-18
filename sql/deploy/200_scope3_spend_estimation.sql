-- 200_scope3_spend_estimation.sql
-- Add spend-based Scope 3 emission estimation using EEIO factors.
-- Used when suppliers don't respond with activity data.

-- EEIO (Environmentally Extended Input-Output) factor table
CREATE TABLE IF NOT EXISTS esg.eeio_factors (
  id            serial PRIMARY KEY,
  category_code text NOT NULL UNIQUE,
  category_name text NOT NULL,
  factor_kgco2e_per_inr numeric NOT NULL,
  source        text NOT NULL DEFAULT 'India EEIO 2024',
  year          int NOT NULL DEFAULT 2024,
  notes         text
);

COMMENT ON TABLE esg.eeio_factors IS 'Spend-based emission factors (kgCO2e per INR) by procurement category';

-- Seed common EEIO factors for Indian supply chains
INSERT INTO esg.eeio_factors (category_code, category_name, factor_kgco2e_per_inr, source, year, notes) VALUES
  ('RAW_MATERIALS',  'Raw materials & commodities',        0.85,  'India EEIO 2024', 2024, 'Metals, chemicals, plastics, minerals'),
  ('PACKAGING',      'Packaging materials',                0.52,  'India EEIO 2024', 2024, 'Cardboard, plastics, glass containers'),
  ('LOGISTICS',      'Transportation & logistics',         1.12,  'India EEIO 2024', 2024, 'Road, rail, sea freight'),
  ('ELECTRICITY',    'Purchased electricity (upstream)',    0.78,  'India EEIO 2024', 2024, 'Grid electricity T&D losses'),
  ('FUEL',           'Fuel & petroleum products',          1.45,  'India EEIO 2024', 2024, 'Diesel, petrol, LPG, natural gas'),
  ('CONSTRUCTION',   'Construction & civil works',         0.68,  'India EEIO 2024', 2024, 'Building materials, construction services'),
  ('IT_SERVICES',    'IT & digital services',              0.18,  'India EEIO 2024', 2024, 'Software, cloud, telecom, hardware'),
  ('PROFESSIONAL',   'Professional services',              0.12,  'India EEIO 2024', 2024, 'Consulting, legal, audit, recruitment'),
  ('TRAVEL',         'Business travel',                    0.95,  'India EEIO 2024', 2024, 'Air, rail, hotel'),
  ('CATERING',       'Food & catering',                    0.62,  'India EEIO 2024', 2024, 'Canteen, meals, food procurement'),
  ('WASTE_MGMT',     'Waste management services',          0.42,  'India EEIO 2024', 2024, 'Waste collection, treatment, disposal'),
  ('WATER_SUPPLY',   'Water supply & treatment',           0.35,  'India EEIO 2024', 2024, 'Municipal water, treatment plants'),
  ('TEXTILES',       'Textiles & apparel',                 0.72,  'India EEIO 2024', 2024, 'Uniforms, fabrics, garments'),
  ('MACHINERY',      'Machinery & equipment',              0.55,  'India EEIO 2024', 2024, 'Capital goods, maintenance'),
  ('OTHER',          'Other procurement',                  0.40,  'India EEIO 2024', 2024, 'Default catch-all category')
ON CONFLICT (category_code) DO NOTHING;

-- Supplier spend table for spend-based estimation
CREATE TABLE IF NOT EXISTS esg.supplier_spend (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  supplier_id   uuid REFERENCES esg.supplier_invites(id),
  supplier_name text NOT NULL,
  category_code text NOT NULL REFERENCES esg.eeio_factors(category_code),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  spend_inr     numeric NOT NULL CHECK (spend_inr >= 0),
  estimated_kgco2e numeric,
  estimation_method text NOT NULL DEFAULT 'EEIO_SPEND',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_name, category_code, period_start, period_end)
);

ALTER TABLE esg.supplier_spend ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='supplier_spend' AND policyname='spend_rls') THEN
    CREATE POLICY spend_rls ON esg.supplier_spend FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

-- Function to estimate Scope 3 emissions from spend
CREATE OR REPLACE FUNCTION esg.estimate_scope3_from_spend(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  ctx uuid := app.current_tenant();
  total_spend numeric;
  total_kgco2e numeric;
  category_count int;
BEGIN
  IF ctx IS NULL OR ctx <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  -- Update estimated emissions for all spend records
  UPDATE esg.supplier_spend ss
  SET estimated_kgco2e = ss.spend_inr * ef.factor_kgco2e_per_inr
  FROM esg.eeio_factors ef
  WHERE ss.category_code = ef.category_code
    AND ss.tenant_id = _tenant
    AND ss.period_start = _pstart AND ss.period_end = _pend;

  -- Aggregate
  SELECT COALESCE(SUM(spend_inr), 0),
         COALESCE(SUM(estimated_kgco2e), 0),
         COUNT(DISTINCT category_code)
  INTO total_spend, total_kgco2e, category_count
  FROM esg.supplier_spend
  WHERE tenant_id = _tenant AND period_start = _pstart AND period_end = _pend;

  RETURN jsonb_build_object(
    'totalSpendINR', total_spend,
    'estimatedKgCO2e', total_kgco2e,
    'categoryCount', category_count,
    'method', 'EEIO_SPEND',
    'factorSource', 'India EEIO 2024'
  );
END $$;
