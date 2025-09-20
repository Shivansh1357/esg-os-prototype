DO $$ BEGIN
  CREATE TYPE esg.finding_status AS ENUM ('PASS','FAIL','RISK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS esg.compliance_rules (
  code        text PRIMARY KEY,
  title       text NOT NULL,
  category    text NOT NULL,
  severity    smallint NOT NULL CHECK (severity BETWEEN 1 AND 5),
  rule_type   text NOT NULL,
  params      jsonb NOT NULL,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS esg.compliance_findings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  rule_code    text NOT NULL REFERENCES esg.compliance_rules(code),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       esg.finding_status NOT NULL,
  severity     smallint NOT NULL,
  reason       text NOT NULL,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_url text,
  owner        uuid,
  due_date     date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_code, period_start, period_end)
);

ALTER TABLE esg.compliance_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS findings_read  ON esg.compliance_findings FOR SELECT USING (tenant_id = app.current_tenant());
CREATE POLICY IF NOT EXISTS findings_write ON esg.compliance_findings FOR ALL     USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());

CREATE TABLE IF NOT EXISTS app.allowed_evidence_prefixes (prefix text PRIMARY KEY);
INSERT INTO app.allowed_evidence_prefixes(prefix) VALUES
  ('s3://uploads/'),
  ('http://localhost:9000/uploads/'),
  ('https://s3.amazonaws.com/uploads/')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION esg.validate_evidence_url(_url text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.allowed_evidence_prefixes p
    WHERE _url LIKE p.prefix || '%'
  )
$$;

CREATE OR REPLACE FUNCTION esg.findings_before_upd_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_findings_before_upd ON esg.compliance_findings;
CREATE TRIGGER trg_findings_before_upd BEFORE UPDATE ON esg.compliance_findings
  FOR EACH ROW EXECUTE FUNCTION esg.findings_before_upd_trg();

DO $seed$
DECLARE
  rules jsonb := jsonb_build_array(
    jsonb_build_object('code','BRSR-01','title','Scope 2 electricity reported','category','Energy','severity',3,'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ELEC_KWH')),
    jsonb_build_object('code','BRSR-02','title','Scope 2 electricity evidence attached','category','Energy','severity',2,'rule_type','EVIDENCE_REQUIRED','params',jsonb_build_object('for','BRSR-01')),
    jsonb_build_object('code','BRSR-03','title','Totals available for the period','category','Energy','severity',3,'rule_type','TOTALS_AVAILABLE','params',jsonb_build_object()),
    jsonb_build_object('code','BRSR-04','title','Reporting period valid (quarter)','category','Governance','severity',2,'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ELEC_KWH')),
    jsonb_build_object('code','BRSR-05','title','Entity master data present','category','Governance','severity',2,'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ELEC_KWH')),
    jsonb_build_object('code','BRSR-06','title','Data approval in place','category','Governance','severity',3,'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ELEC_KWH')),
    jsonb_build_object('code','BRSR-07','title','Evidence attached for material metrics','category','Governance','severity',2,'rule_type','EVIDENCE_REQUIRED','params',jsonb_build_object('for','BRSR-03')),
    jsonb_build_object('code','BRSR-08','title','Scope 2 market-based available','category','Energy','severity',2,'rule_type','TOTALS_AVAILABLE','params',jsonb_build_object()),
    jsonb_build_object('code','BRSR-09','title','Scope 2 location-based available','category','Energy','severity',2,'rule_type','TOTALS_AVAILABLE','params',jsonb_build_object()),
    jsonb_build_object('code','BRSR-10','title','At least one APPROVED fact in period','category','Governance','severity',3,'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ELEC_KWH')),
    jsonb_build_object('code','BRSR-11','title','Evidence attached for electricity bills','category','Energy','severity',2,'rule_type','EVIDENCE_REQUIRED','params',jsonb_build_object('for','BRSR-01')),
    jsonb_build_object('code','BRSR-12','title','Totals factor set assigned','category','Energy','severity',2,'rule_type','TOTALS_AVAILABLE','params',jsonb_build_object()),
    jsonb_build_object('code','BRSR-13','title','Quarterly continuity (prior quarter exists)','category','Governance','severity',1,'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ELEC_KWH')),
    jsonb_build_object('code','BRSR-14','title','Evidence for market-based instruments','category','Energy','severity',1,'rule_type','EVIDENCE_REQUIRED','params',jsonb_build_object('for','BRSR-08')),
    jsonb_build_object('code','BRSR-15','title','Submission ready (totals + evidence baseline)','category','Governance','severity',4,'rule_type','TOTALS_AVAILABLE','params',jsonb_build_object())
  );
BEGIN
  INSERT INTO esg.compliance_rules(code,title,category,severity,rule_type,params,active)
  SELECT r->>'code', r->>'title', r->>'category', (r->>'severity')::smallint, r->>'rule_type', r->'params', true
  FROM jsonb_array_elements(rules) r
  ON CONFLICT (code) DO UPDATE
    SET title=EXCLUDED.title, category=EXCLUDED.category, severity=EXCLUDED.severity,
        rule_type=EXCLUDED.rule_type, params=EXCLUDED.params, active=true;
END
$seed$;

CREATE OR REPLACE FUNCTION esg.evaluate_brsr(
  _tenant uuid,
  _pstart date,
  _pend   date
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid;
  r record;
  have_approved boolean;
  have_totals boolean;
  have_evidence boolean;
  stat esg.finding_status;
  rsn text;
  pass_count int := 0;
  fail_count int := 0;
  risk_count int := 0;
  total_count int := 0;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  FOR r IN SELECT * FROM esg.compliance_rules WHERE active = true ORDER BY code LOOP
    total_count := total_count + 1;
    stat := 'FAIL'; rsn := 'Not evaluated';

    IF r.rule_type = 'REQUIRED_FACT' THEN
      SELECT EXISTS (
        SELECT 1 FROM esg.facts f
        WHERE f.tenant_id=_tenant AND f.period_start=_pstart AND f.period_end=_pend
          AND f.status='APPROVED' AND f.metric_code = (r.params->>'metricCode')
      ) INTO have_approved;
      IF have_approved THEN stat := 'PASS'; rsn := format('Approved %s present', r.params->>'metricCode');
      ELSE stat := 'FAIL'; rsn := format('Missing approved %s', r.params->>'metricCode'); END IF;

    ELSIF r.rule_type = 'TOTALS_AVAILABLE' THEN
      SELECT EXISTS (
        SELECT 1 FROM esg.emission_totals t
        WHERE t.tenant_id=_tenant AND t.period_start=_pstart AND t.period_end=_pend
      ) INTO have_totals;
      IF have_totals THEN stat := 'PASS'; rsn := 'Totals exist for period';
      ELSE stat := 'RISK'; rsn := 'Totals missing; recalc pending or no approved data'; END IF;

    ELSIF r.rule_type = 'EVIDENCE_REQUIRED' THEN
      SELECT (evidence_url IS NOT NULL AND evidence_url <> '')
      INTO have_evidence
      FROM esg.compliance_findings
      WHERE tenant_id=_tenant AND rule_code=r.code AND period_start=_pstart AND period_end=_pend;
      IF have_evidence THEN stat := 'PASS'; rsn := 'Evidence provided';
      ELSE stat := 'FAIL'; rsn := 'Evidence missing'; END IF;
    ELSE
      stat := 'RISK'; rsn := 'Unknown rule type';
    END IF;

    INSERT INTO esg.compliance_findings(tenant_id,rule_code,period_start,period_end,status,severity,reason,data)
    VALUES (_tenant, r.code, _pstart, _pend, stat, r.severity, rsn, jsonb_build_object('ruleType', r.rule_type, 'params', r.params))
    ON CONFLICT (tenant_id, rule_code, period_start, period_end)
    DO UPDATE SET status=EXCLUDED.status, severity=EXCLUDED.severity, reason=EXCLUDED.reason, data=EXCLUDED.data, updated_at=now();

    IF stat='PASS' THEN pass_count := pass_count + 1;
    ELSIF stat='FAIL' THEN fail_count := fail_count + 1;
    ELSE risk_count := risk_count + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', total_count,
    'pass', pass_count,
    'fail', fail_count,
    'risk', risk_count,
    'completeness', CASE WHEN total_count>0 THEN round((pass_count::numeric/total_count)*100,2) ELSE 0 END
  );
END $$;


