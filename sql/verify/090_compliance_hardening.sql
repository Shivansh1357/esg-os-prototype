SELECT to_regclass('esg.compliance_rules') IS NOT NULL;
SELECT to_regclass('esg.compliance_findings') IS NOT NULL;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='compliance_rules' AND column_name='id'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='compliance_rules' AND column_name='framework'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='compliance_findings' AND column_name='rule_id'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='compliance_findings' AND column_name='completeness_weight'
);

SELECT relrowsecurity
FROM pg_class
WHERE oid = 'esg.compliance_findings'::regclass;

DO $$
DECLARE
  tid uuid;
  eid uuid;
  pct numeric;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D4H-V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);

  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',1,'kWh','APPROVED');

  PERFORM esg.evaluate_brsr(tid,'2025-07-01','2025-09-30');
  SELECT esg.completeness_percent(tid,'2025-07-01','2025-09-30') INTO pct;

  IF pg_typeof(pct) <> 'numeric'::regtype THEN
    RAISE EXCEPTION 'completeness_percent did not return numeric';
  END IF;
END $$;
