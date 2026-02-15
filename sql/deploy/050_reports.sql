DO $$ BEGIN
  CREATE TYPE esg.section_status AS ENUM ('DRAFT','APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS esg.reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  template     text NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esg.report_sections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  report_id  uuid NOT NULL REFERENCES esg.reports(id) ON DELETE CASCADE,
  code       text NOT NULL,
  title      text NOT NULL,
  status     esg.section_status NOT NULL DEFAULT 'DRAFT',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, report_id, code)
);

CREATE TABLE IF NOT EXISTS esg.report_artifacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  report_id  uuid NOT NULL REFERENCES esg.reports(id) ON DELETE CASCADE,
  format     text NOT NULL CHECK (format IN ('pdf','xlsx')),
  s3_key     text NOT NULL,
  bytes      bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE esg.reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.report_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.report_artifacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='reports' AND policyname='reports_rls') THEN
    CREATE POLICY reports_rls   ON esg.reports          FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='report_sections' AND policyname='sections_rls') THEN
    CREATE POLICY sections_rls  ON esg.report_sections  FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='report_artifacts' AND policyname='artifacts_rls') THEN
    CREATE POLICY artifacts_rls ON esg.report_artifacts FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION esg.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_reports_touch ON esg.reports;
CREATE TRIGGER trg_reports_touch BEFORE UPDATE ON esg.reports
  FOR EACH ROW EXECUTE FUNCTION esg.touch_updated_at();

DROP TRIGGER IF EXISTS trg_sections_touch ON esg.report_sections;
CREATE TRIGGER trg_sections_touch BEFORE UPDATE ON esg.report_sections
  FOR EACH ROW EXECUTE FUNCTION esg.touch_updated_at();

CREATE OR REPLACE FUNCTION esg.default_report_period(_tenant uuid)
RETURNS TABLE (period_start date, period_end date)
LANGUAGE plpgsql AS $$
DECLARE p_start date; p_end date;
BEGIN
  SELECT max(t.period_start) INTO p_start FROM esg.emission_totals t WHERE t.tenant_id = _tenant;
  IF p_start IS NULL THEN p_start := date_trunc('quarter', now())::date; END IF;
  p_end := (date_trunc('quarter', p_start) + interval '3 months' - interval '1 day')::date;
  RETURN QUERY SELECT p_start, p_end;
END $$;


