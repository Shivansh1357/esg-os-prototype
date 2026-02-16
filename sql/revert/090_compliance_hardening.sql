DROP FUNCTION IF EXISTS esg.completeness_percent(uuid,date,date);

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

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_findings_tenant_rule_period_key'
      AND conrelid = 'esg.compliance_findings'::regclass
  ) THEN
    ALTER TABLE esg.compliance_findings
      DROP CONSTRAINT compliance_findings_tenant_rule_period_key;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_findings_rule_id_fkey'
      AND conrelid = 'esg.compliance_findings'::regclass
  ) THEN
    ALTER TABLE esg.compliance_findings
      DROP CONSTRAINT compliance_findings_rule_id_fkey;
  END IF;
END $$;

ALTER TABLE esg.compliance_findings
  DROP COLUMN IF EXISTS rule_id,
  DROP COLUMN IF EXISTS completeness_weight,
  DROP COLUMN IF EXISTS last_evaluated_at;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_rules_metric_code_fkey'
      AND conrelid = 'esg.compliance_rules'::regclass
  ) THEN
    ALTER TABLE esg.compliance_rules
      DROP CONSTRAINT compliance_rules_metric_code_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_rules_id_key'
      AND conrelid = 'esg.compliance_rules'::regclass
  ) THEN
    ALTER TABLE esg.compliance_rules
      DROP CONSTRAINT compliance_rules_id_key;
  END IF;
END $$;

ALTER TABLE esg.compliance_rules
  DROP COLUMN IF EXISTS id,
  DROP COLUMN IF EXISTS framework,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS metric_code,
  DROP COLUMN IF EXISTS requires_evidence,
  DROP COLUMN IF EXISTS severity_level;

DROP TYPE IF EXISTS esg.rule_severity;
