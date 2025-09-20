SELECT to_regclass('esg.compliance_rules') IS NOT NULL;
SELECT to_regclass('esg.compliance_findings') IS NOT NULL;

SELECT count(*)>='15'::int FROM esg.compliance_rules;

DO $$
DECLARE tid uuid; eid uuid; summary jsonb;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D4V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',1000,'kWh','APPROVED');
  summary := esg.evaluate_brsr(tid,'2025-07-01','2025-09-30');
  IF summary->>'total' IS NULL THEN RAISE EXCEPTION 'no summary'; END IF;
END $$;


