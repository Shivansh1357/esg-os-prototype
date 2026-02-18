SELECT to_regprocedure('esg.scope3_supplier_total(uuid,date,date)') IS NOT NULL;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'esg'
    AND table_name = 'supplier_responses'
    AND column_name = 'approved'
);

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'esg'
    AND table_name = 'exec_kpi_base'
    AND column_name = 'supplier_coverage_percent'
);

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'esg'
    AND table_name = 'exec_kpi_base'
    AND column_name = 'scope3_internal'
);

DO $$
DECLARE
  tid uuid;
  eid uuid;
  fsid uuid;
  rid uuid;
  sid1 uuid;
  sid2 uuid;
  sid3 uuid;
  uid uuid := gen_random_uuid();
  cov jsonb;
  payload jsonb;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D7V') RETURNING id INTO tid;
  INSERT INTO esg.entities(tenant_id,name,etype) VALUES(tid,'ORG Root','ORG') RETURNING id INTO eid;
  SELECT id INTO fsid FROM esg.factor_sets ORDER BY created_at LIMIT 1;

  INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id)
  VALUES (tid, fsid)
  ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id = EXCLUDED.factor_set_id, updated_at = now();

  INSERT INTO esg.suppliers(tenant_id, name, email, category, spend)
  VALUES (tid,'S1','s1@verify.local','Purchased goods',100)
  RETURNING id INTO sid1;

  INSERT INTO esg.suppliers(tenant_id, name, email, category, spend)
  VALUES (tid,'S2','s2@verify.local','Purchased goods',100)
  RETURNING id INTO sid2;

  INSERT INTO esg.suppliers(tenant_id, name, email, category, spend)
  VALUES (tid,'S3','s3@verify.local','Purchased goods',100)
  RETURNING id INTO sid3;

  INSERT INTO esg.supplier_invites(tenant_id, supplier_id, period_start, period_end, invited_email, expires_at)
  VALUES
    (tid,sid1,'2025-07-01','2025-09-30','s1@verify.local', now() + interval '2 day'),
    (tid,sid2,'2025-07-01','2025-09-30','s2@verify.local', now() + interval '2 day'),
    (tid,sid3,'2025-07-01','2025-09-30','s3@verify.local', now() + interval '2 day');

  INSERT INTO esg.supplier_responses(tenant_id, supplier_id, period_start, period_end, emissions_kgco2e, category, approved)
  VALUES
    (tid,sid1,'2025-07-01','2025-09-30',10,'Purchased goods',true),
    (tid,sid2,'2025-07-01','2025-09-30',20,'Purchased goods',true);

  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', uid::text, true);

  PERFORM esg.recalc_emissions(tid, eid, '2025-07-01', '2025-09-30', fsid);
  PERFORM esg.evaluate_brsr(tid, '2025-07-01', '2025-09-30');

  INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
  VALUES (tid,'D7 Verify','BRSR','2025-07-01','2025-09-30')
  RETURNING id INTO rid;

  cov := esg.suppliers_coverage(tid, '2025-07-01', '2025-09-30');
  IF (cov->>'coverageByCountPercent')::numeric <> 66.67 THEN
    RAISE EXCEPTION 'expected coverageByCountPercent=66.67, got %', cov->>'coverageByCountPercent';
  END IF;

  payload := esg.get_exec_kpis(tid, rid);
  IF payload->>'mode' <> 'live' THEN
    RAISE EXCEPTION 'expected live mode exec payload';
  END IF;
  IF jsonb_array_length(payload->'kpis') < 10 THEN
    RAISE EXCEPTION 'expected expanded KPI payload with supplier breakdown';
  END IF;
END $$;
