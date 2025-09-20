-- Schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS esg;
CREATE SCHEMA IF NOT EXISTS app;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- for citext type

-- App GUC (context vars) — set via SET LOCAL
-- We'll read these in policies and procs
-- app.tenant_id uuid, app.user_id uuid
-- No explicit CREATE VARIABLE in PG14; use current_setting('app.tenant_id', true)
-- Safety: provide helpers
CREATE OR REPLACE FUNCTION app.current_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;


