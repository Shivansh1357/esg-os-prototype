-- 240_tenant_settings.sql
-- Persist per-tenant onboarding/reporting settings (framework, fiscal year,
-- reporting currency, units). One row per tenant, tenant-isolated via RLS.

CREATE TABLE IF NOT EXISTS esg.tenant_settings (
  tenant_id          uuid PRIMARY KEY REFERENCES esg.tenants(id) ON DELETE CASCADE,
  framework          text NOT NULL DEFAULT 'BRSR',
  fiscal_year_start  text NOT NULL DEFAULT '04-01',
  reporting_currency text NOT NULL DEFAULT 'INR',
  units              text NOT NULL DEFAULT 'metric',
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE esg.tenant_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='esg' AND tablename='tenant_settings' AND policyname='tenant_settings_rls'
  ) THEN
    CREATE POLICY tenant_settings_rls ON esg.tenant_settings FOR ALL
      USING (tenant_id = app.current_tenant())
      WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;
