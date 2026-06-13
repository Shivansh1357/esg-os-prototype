-- 250_auth_login.sql
-- Password-based login for esg.users + an RLS-bypassing credential check.

-- Store a bcrypt hash (pgcrypto) per user. NULL = login not enabled for that user.
ALTER TABLE esg.users ADD COLUMN IF NOT EXISTS password_hash text;

-- Verify credentials with no tenant context (email -> tenant resolution happens
-- here). SECURITY DEFINER intentionally bypasses RLS so login can find the user
-- before a tenant is known; it returns a row ONLY on a correct password match
-- for an ACTIVE, login-enabled user. Password check uses pgcrypto bcrypt: re-hash
-- the supplied password with the stored salt and compare.
CREATE OR REPLACE FUNCTION auth.verify_login(_email citext, _password text)
RETURNS TABLE (tenant_id uuid, user_id uuid, role text, email citext)
LANGUAGE sql
SECURITY DEFINER
SET search_path = esg, public
AS $$
  SELECT u.tenant_id, u.id, u.role, u.email
  FROM esg.users u
  WHERE u.email = _email
    AND u.status = 'ACTIVE'
    AND u.password_hash IS NOT NULL
    AND u.password_hash = crypt(_password, u.password_hash);
$$;

-- Least privilege: only the function owner (the role the API connects as) may
-- execute it; not arbitrary roles.
REVOKE ALL ON FUNCTION auth.verify_login(citext, text) FROM PUBLIC;
