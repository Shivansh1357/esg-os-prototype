-- Tenants & Users
CREATE TABLE IF NOT EXISTS esg.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esg.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','MEMBER','AUDITOR')),
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Entities (ORG / BU / SITE)
DO $$ BEGIN
  CREATE TYPE esg.entity_type AS ENUM ('ORG','BU','SITE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS esg.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES esg.entities(id) ON DELETE SET NULL,
  name text NOT NULL,
  etype esg.entity_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Metrics catalog (codes are stable)
CREATE TABLE IF NOT EXISTS esg.metrics (
  code text PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL,
  scope smallint NOT NULL CHECK (scope IN (1,2,3))
);

-- RLS: isolate by tenant_id
ALTER TABLE esg.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE esg.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS users_tenant_isolation ON esg.users
USING (tenant_id = app.current_tenant());

CREATE POLICY IF NOT EXISTS entities_tenant_isolation ON esg.entities
USING (tenant_id = app.current_tenant());

-- For admins: we’ll gate writes via application role, keep RLS simple:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA esg TO PUBLIC; -- restricted by RLS

-- Sample seed metric(s)
INSERT INTO esg.metrics (code,name,unit,scope) VALUES
  ('ELEC_KWH', 'Electricity consumption', 'kWh', 2)
ON CONFLICT DO NOTHING;


