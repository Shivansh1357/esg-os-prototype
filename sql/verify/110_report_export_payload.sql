SELECT to_regprocedure('esg.get_report_export_payload(uuid,uuid)') IS NOT NULL;

DO $$
DECLARE
  tid uuid;
  eid uuid;
  rid uuid;
  uid uuid := gen_random_uuid();
  fsid uuid;
  payload jsonb;
  snap_before jsonb;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D6V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  SELECT id INTO fsid FROM esg.factor_sets ORDER BY created_at LIMIT 1;
  INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id) VALUES (tid, fsid);

  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', uid::text, true);

  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',1000,'kWh','APPROVED');

  PERFORM esg.recalc_emissions(tid,eid,'2025-07-01','2025-09-30',fsid);
  PERFORM esg.evaluate_brsr(tid,'2025-07-01','2025-09-30');

  INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
  VALUES (tid,'D6 Verify','BRSR','2025-07-01','2025-09-30')
  RETURNING id INTO rid;

  SELECT esg.get_report_export_payload(tid, rid) INTO payload;
  IF payload->>'mode' <> 'live' THEN
    RAISE EXCEPTION 'draft payload did not return live mode';
  END IF;

  PERFORM esg.freeze_report(tid, rid, uid);

  SELECT compliance_snapshot INTO snap_before FROM esg.reports WHERE id = rid;

  UPDATE esg.emission_totals
     SET scope1 = 999999
   WHERE tenant_id = tid
     AND entity_id = eid
     AND period_start = '2025-07-01'
     AND period_end = '2025-09-30'
     AND factor_set_id = fsid;

  UPDATE esg.compliance_findings
     SET status = 'RISK',
         reason = 'tampered'
   WHERE tenant_id = tid
     AND period_start = '2025-07-01'
     AND period_end = '2025-09-30';

  SELECT esg.get_report_export_payload(tid, rid) INTO payload;

  IF payload->>'mode' <> 'snapshot' THEN
    RAISE EXCEPTION 'locked payload did not return snapshot mode';
  END IF;

  IF (payload #>> '{totals,s1}')::numeric = 999999 THEN
    RAISE EXCEPTION 'locked payload used live emission_totals';
  END IF;

  IF payload->'complianceFindings' <> snap_before THEN
    RAISE EXCEPTION 'locked payload did not use report.compliance_snapshot';
  END IF;
END $$;
