SELECT to_regprocedure('auth.verify_login(citext, text)') IS NOT NULL;
-- Errors (failing verify) if the column was not added.
SELECT password_hash FROM esg.users WHERE false;
