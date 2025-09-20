DO $$
DECLARE tid uuid; eid uuid; fs uuid; ps date:='2025-07-01'; pe date:='2025-09-30';
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D8V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
  SELECT id INTO fs FROM esg.factor_sets WHERE code='IN-CEA-2024';
  INSERT INTO esg.tenant_defaults(tenant_id,factor_set_id) VALUES(tid,fs)
  ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id;
  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH',ps,pe,1000,'kWh','APPROVED');
  PERFORM esg.recalc_emissions(tid,eid,ps,pe,fs);
  PERFORM esg.evaluate_brsr(tid, ps, pe);
  INSERT INTO esg.suppliers(tenant_id,name,email,category,spend) VALUES (tid,'Alpha','a@x','Purchased goods',100000);
  INSERT INTO esg.supplier_invites(tenant_id,supplier_id,period_start,period_end,invited_email,expires_at)
  SELECT tid, id, ps, pe, 'a@x', now()+interval '7 days' FROM esg.suppliers WHERE tenant_id=tid;
  INSERT INTO esg.supplier_responses(tenant_id,supplier_id,period_start,period_end,emissions_kgco2e)
  SELECT tid, id, ps, pe, 123 FROM esg.suppliers WHERE tenant_id=tid LIMIT 1;
  PERFORM esg.exec_kpis(tid, ps, pe);
END $$;


