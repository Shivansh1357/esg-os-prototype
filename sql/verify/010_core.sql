-- Schemas and tables exist
SELECT to_regclass('esg.tenants') IS NOT NULL;
SELECT to_regclass('esg.users') IS NOT NULL;
SELECT to_regclass('esg.entities') IS NOT NULL;
SELECT to_regclass('esg.metrics') IS NOT NULL;

-- RLS enabled
SELECT relrowsecurity FROM pg_class WHERE relname='users' AND relnamespace='esg'::regnamespace;
SELECT relrowsecurity FROM pg_class WHERE relname='entities' AND relnamespace='esg'::regnamespace;

-- Metrics seed present
SELECT 1 FROM esg.metrics WHERE code='ELEC_KWH';


