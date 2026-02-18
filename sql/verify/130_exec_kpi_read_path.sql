SELECT to_regclass('esg.exec_kpi_base') IS NOT NULL;
SELECT to_regprocedure('esg.refresh_exec_kpi_base()') IS NOT NULL;
SELECT to_regprocedure('esg.get_exec_kpis(uuid,uuid)') IS NOT NULL;

SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'esg'
    AND indexname = 'exec_kpi_base_tenant_period_factor_idx'
);

DO $$
DECLARE
  tid uuid;
  eid uuid;
  fsid uuid;
  rid uuid;
  uid uuid := gen_random_uuid();
  payload jsonb;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D8P2V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  SELECT id INTO fsid FROM esg.factor_sets ORDER BY created_at LIMIT 1;
  INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id)
  VALUES (tid, fsid)
  ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id = EXCLUDED.factor_set_id, updated_at = now();

  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', uid::text, true);

  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',100,'kWh','APPROVED');

  PERFORM esg.recalc_emissions(tid,eid,'2025-07-01','2025-09-30',fsid);
  PERFORM esg.evaluate_brsr(tid,'2025-07-01','2025-09-30');

  INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
  VALUES (tid,'Exec P2 Verify','BRSR','2025-07-01','2025-09-30')
  RETURNING id INTO rid;

  SELECT esg.get_exec_kpis(tid, rid) INTO payload;

  IF payload->>'mode' <> 'live' THEN
    RAISE EXCEPTION 'expected live mode for draft report';
  END IF;

  IF jsonb_array_length(payload->'kpis') < 8 THEN
    RAISE EXCEPTION 'unexpected KPI length in exec payload';
  END IF;
END $$;
