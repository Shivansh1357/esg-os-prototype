DROP FUNCTION IF EXISTS auth.verify_login(citext, text);
ALTER TABLE esg.users DROP COLUMN IF EXISTS password_hash;
