SELECT to_regclass('esg.report_freezes') IS NOT NULL;

DO $$
DECLARE tid uuid; rid uuid; uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D7V') RETURNING id INTO tid;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', uid::text, true);
  INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
  VALUES (tid,'Assurance Draft','BRSR','2025-07-01','2025-09-30') RETURNING id INTO rid;
  PERFORM esg.report_lineage(tid, rid);
  PERFORM esg.freeze_report(tid, rid, uid);
  PERFORM 1 FROM esg.report_freezes WHERE tenant_id=tid AND report_id=rid;
  PERFORM 1 FROM esg.reports WHERE id=rid AND locked=true AND version_minor>=1;
END $$;


