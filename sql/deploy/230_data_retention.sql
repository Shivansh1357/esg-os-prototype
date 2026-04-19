-- 230_data_retention.sql
-- Data retention policies: configurable per-tenant retention windows with automated cleanup.

BEGIN;

-- Retention policies table
CREATE TABLE IF NOT EXISTS esg.retention_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  entity          text NOT NULL,               -- target table name (e.g. 'facts_audit', 'notifications')
  retention_days  int  NOT NULL CHECK (retention_days > 0),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity)
);

ALTER TABLE esg.retention_policies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'esg' AND tablename = 'retention_policies' AND policyname = 'retention_policies_rls'
  ) THEN
    CREATE POLICY retention_policies_rls ON esg.retention_policies FOR ALL
      USING  (tenant_id = app.current_tenant())
      WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant
  ON esg.retention_policies (tenant_id, active)
  WHERE active = true;

-- Seed default policies for every existing tenant
INSERT INTO esg.retention_policies (tenant_id, entity, retention_days)
SELECT t.id, p.entity, p.retention_days
FROM esg.tenants t
CROSS JOIN (
  VALUES
    ('facts_audit',      365),
    ('notifications',     90),
    ('report_artifacts', 730)
) AS p(entity, retention_days)
ON CONFLICT (tenant_id, entity) DO NOTHING;

-- Function to apply retention policies for a given tenant
CREATE OR REPLACE FUNCTION esg.apply_retention_policies(_tenant uuid)
RETURNS TABLE(entity text, deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pol   record;
  cnt   bigint;
BEGIN
  -- Validate tenant context
  IF app.current_tenant() IS NULL OR app.current_tenant() <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  FOR pol IN
    SELECT rp.entity, rp.retention_days
    FROM esg.retention_policies rp
    WHERE rp.tenant_id = _tenant
      AND rp.active = true
  LOOP
    cnt := 0;

    IF pol.entity = 'facts_audit' THEN
      DELETE FROM esg.facts_audit
      WHERE tenant_id = _tenant
        AND at < now() - (pol.retention_days || ' days')::interval;
      GET DIAGNOSTICS cnt = ROW_COUNT;

    ELSIF pol.entity = 'notifications' THEN
      DELETE FROM esg.notifications
      WHERE tenant_id = _tenant
        AND created_at < now() - (pol.retention_days || ' days')::interval;
      GET DIAGNOSTICS cnt = ROW_COUNT;

    ELSIF pol.entity = 'report_artifacts' THEN
      DELETE FROM esg.report_artifacts
      WHERE tenant_id = _tenant
        AND created_at < now() - (pol.retention_days || ' days')::interval;
      GET DIAGNOSTICS cnt = ROW_COUNT;

    END IF;

    entity := pol.entity;
    deleted_count := cnt;
    RETURN NEXT;
  END LOOP;

  RETURN;
END $$;

COMMIT;
