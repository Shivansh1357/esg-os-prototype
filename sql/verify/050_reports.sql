SELECT to_regclass('esg.reports') IS NOT NULL;
SELECT to_regclass('esg.report_sections') IS NOT NULL;
SELECT to_regclass('esg.report_artifacts') IS NOT NULL;

DO $$
DECLARE tid uuid; ps date; pe date;
BEGIN
  INSERT INTO esg.tenants(name) VALUES('D5V') RETURNING id INTO tid;
  PERFORM set_config('app.tenant_id', tid::text, true);
  SELECT period_start, period_end INTO ps, pe FROM esg.default_report_period(tid);
  IF ps IS NULL OR pe IS NULL THEN RAISE EXCEPTION 'no default period'; END IF;
END $$;


