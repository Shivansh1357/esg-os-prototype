SELECT to_regclass('esg.factor_sets') IS NOT NULL;
SELECT to_regclass('esg.emission_factors') IS NOT NULL;
SELECT to_regclass('esg.emission_totals') IS NOT NULL;

-- Seed exists
SELECT 1 FROM esg.factor_sets WHERE code='IN-CEA-2024';

-- Proc round-trip smoke
DO $$
DECLARE tid uuid; eid uuid; fs uuid; outrow esg.emission_totals%ROWTYPE;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D3V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  SELECT id INTO fs FROM esg.factor_sets WHERE code='IN-CEA-2024';
  INSERT INTO esg.tenant_defaults(tenant_id,factor_set_id) VALUES(tid,fs)
  ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',1000,'kWh','APPROVED');
  outrow := esg.recalc_emissions(tid,eid,'2025-07-01','2025-09-30',fs);
  IF outrow.scope2_loc IS NULL THEN
    RAISE EXCEPTION 'recalc did not compute';
  END IF;
END $$;


