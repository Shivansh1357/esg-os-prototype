SELECT to_regnamespace('auth') IS NOT NULL;
SELECT to_regnamespace('esg') IS NOT NULL;
SELECT to_regnamespace('app') IS NOT NULL;
SELECT app.current_tenant();
SELECT app.current_user_id();


