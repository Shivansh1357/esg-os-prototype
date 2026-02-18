SELECT 1/COUNT(*) FROM information_schema.tables
WHERE table_schema='esg' AND table_name='pilot_metrics';

SELECT 1/COUNT(*) FROM information_schema.tables
WHERE table_schema='esg' AND table_name='feedback';

SELECT 1/COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='esg' AND p.proname='record_pilot_event';

SELECT 1/COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='esg' AND p.proname='get_onboarding_checklist';

SELECT pg_typeof(esg.get_onboarding_checklist('00000000-0000-0000-0000-000000000001'::uuid)) = 'jsonb'::regtype;
