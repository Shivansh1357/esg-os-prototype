SELECT to_regclass('esg.suppliers') IS NOT NULL;
SELECT to_regclass('esg.supplier_invites') IS NOT NULL;
SELECT to_regclass('esg.supplier_responses') IS NOT NULL;

DO $$
DECLARE tid uuid; ps date := '2025-07-01'; pe date := '2025-09-30';
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D6V') RETURNING id INTO tid;
  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);

  INSERT INTO esg.suppliers(tenant_id,name,email,category,spend)
  VALUES (tid,'Alpha Co','alpha@example.com','Purchased goods',1000),
         (tid,'Beta Ltd','beta@example.com','Purchased goods',2000);

  INSERT INTO esg.supplier_invites(tenant_id,supplier_id,period_start,period_end,invited_email,expires_at)
  SELECT tid, id, ps, pe, email, now()+interval '7 days' FROM esg.suppliers WHERE tenant_id=tid;

  INSERT INTO esg.supplier_responses(tenant_id,supplier_id,period_start,period_end,status,emissions_kgco2e,evidence_url)
  SELECT tid, id, ps, pe, 'SUBMITTED','123','s3://uploads/x.pdf' FROM esg.suppliers WHERE tenant_id=tid LIMIT 1;

  PERFORM esg.suppliers_coverage(tid, ps, pe);
  PERFORM * FROM esg.suppliers_category_rollup(tid, ps, pe);
END $$;


