SELECT to_regclass('esg.report_freezes') IS NOT NULL;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='reports' AND column_name='factor_set_id'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='reports' AND column_name='calc_version'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='reports' AND column_name='compliance_snapshot'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='reports' AND column_name='completeness_percent'
);
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='esg' AND table_name='reports' AND column_name='is_locked'
);

DO $$
DECLARE
  tid uuid;
  rid uuid;
  eid uuid;
  fsid uuid;
  uid uuid := gen_random_uuid();
  fid uuid;
  blocked_update boolean := false;
  blocked_insert boolean := false;
  blocked_delete boolean := false;
  blocked_recalc boolean := false;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D5V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'HQ','ORG') RETURNING id INTO eid;
  SELECT id INTO fsid FROM esg.factor_sets ORDER BY created_at LIMIT 1;
  INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id) VALUES (tid, fsid);

  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', uid::text, true);

  INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
  VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',100,'kWh','APPROVED')
  RETURNING id INTO fid;

  PERFORM esg.recalc_emissions(tid,eid,'2025-07-01','2025-09-30',fsid);
  PERFORM esg.evaluate_brsr(tid,'2025-07-01','2025-09-30');

  INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
  VALUES (tid,'Freeze Verify','BRSR','2025-07-01','2025-09-30')
  RETURNING id INTO rid;

  PERFORM esg.freeze_report(tid, rid, uid);

  PERFORM 1
  FROM esg.reports
  WHERE id = rid
    AND is_locked = true
    AND factor_set_id IS NOT NULL
    AND calc_version IS NOT NULL
    AND compliance_snapshot IS NOT NULL
    AND completeness_percent IS NOT NULL
    AND frozen_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'freeze did not snapshot required report fields';
  END IF;

  BEGIN
    UPDATE esg.facts SET value = value + 1 WHERE id = fid;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    blocked_update := true;
  END;
  IF blocked_update IS NOT TRUE THEN
    RAISE EXCEPTION 'frozen period fact update was not blocked';
  END IF;

  BEGIN
    INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
    VALUES (tid,eid,'ELEC_KWH','2025-07-01','2025-09-30',123,'kWh','DRAFT');
  EXCEPTION WHEN SQLSTATE '55000' THEN
    blocked_insert := true;
  END;
  IF blocked_insert IS NOT TRUE THEN
    RAISE EXCEPTION 'frozen period fact insert was not blocked';
  END IF;

  BEGIN
    DELETE FROM esg.facts WHERE id = fid;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    blocked_delete := true;
  END;
  IF blocked_delete IS NOT TRUE THEN
    RAISE EXCEPTION 'frozen period fact delete was not blocked';
  END IF;

  BEGIN
    PERFORM esg.recalc_emissions(tid,eid,'2025-07-01','2025-09-30',fsid);
  EXCEPTION WHEN SQLSTATE '55000' THEN
    blocked_recalc := true;
  END;
  IF blocked_recalc IS NOT TRUE THEN
    RAISE EXCEPTION 'recalc for frozen period was not blocked';
  END IF;
END $$;
