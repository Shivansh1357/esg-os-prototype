-- tables + rls
SELECT to_regclass('esg.facts') IS NOT NULL;
SELECT to_regclass('esg.facts_audit') IS NOT NULL;
SELECT relrowsecurity FROM pg_class WHERE relname='facts' AND relnamespace='esg'::regnamespace;

-- insert creates partition and audit row
-- seed tenant/entity
WITH t AS (
  INSERT INTO esg.tenants(name) VALUES('V020') RETURNING id
), e AS (
  INSERT INTO esg.entities(tenant_id,name,etype)
  SELECT id,'HQ','ORG' FROM t RETURNING id, tenant_id
)
SELECT esg.ensure_facts_partition(current_date);

-- upsert_fact returns id
DO $$
DECLARE tid uuid; eid uuid; fid uuid;
BEGIN
  SELECT id INTO tid FROM esg.tenants WHERE name='V020';
  SELECT id INTO eid FROM esg.entities WHERE tenant_id=tid LIMIT 1;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
  fid := esg.upsert_fact(tid, eid, 'ELEC_KWH', date_trunc('quarter', now())::date, (date_trunc('quarter', now())+interval '3 mon' - interval '1 day')::date, 100, 'kWh', 'CSV','s3://x/y.csv', gen_random_uuid());
  IF fid IS NULL THEN RAISE EXCEPTION 'upsert returned null'; END IF;
END $$;


