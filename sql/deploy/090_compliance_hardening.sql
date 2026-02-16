DO $$ BEGIN
  CREATE TYPE esg.rule_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE esg.compliance_rules
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS framework text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS metric_code text,
  ADD COLUMN IF NOT EXISTS requires_evidence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS severity_level esg.rule_severity;

UPDATE esg.compliance_rules
SET id = gen_random_uuid()
WHERE id IS NULL;

UPDATE esg.compliance_rules
SET framework = COALESCE(framework, 'BRSR_CORE'),
    description = COALESCE(description, title),
    metric_code = COALESCE(metric_code, params->>'metricCode'),
    requires_evidence = COALESCE(requires_evidence, rule_type = 'EVIDENCE_REQUIRED'),
    severity_level = COALESCE(
      severity_level,
      CASE
        WHEN severity >= 4 THEN 'HIGH'::esg.rule_severity
        WHEN severity >= 2 THEN 'MEDIUM'::esg.rule_severity
        ELSE 'LOW'::esg.rule_severity
      END
    )
WHERE framework IS NULL
   OR description IS NULL
   OR severity_level IS NULL;

ALTER TABLE esg.compliance_rules
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN framework SET NOT NULL,
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN severity_level SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_rules_id_key'
      AND conrelid = 'esg.compliance_rules'::regclass
  ) THEN
    ALTER TABLE esg.compliance_rules
      ADD CONSTRAINT compliance_rules_id_key UNIQUE (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_rules_metric_code_fkey'
      AND conrelid = 'esg.compliance_rules'::regclass
  ) THEN
    ALTER TABLE esg.compliance_rules
      ADD CONSTRAINT compliance_rules_metric_code_fkey
      FOREIGN KEY (metric_code) REFERENCES esg.metrics(code);
  END IF;
END $$;

ALTER TABLE esg.compliance_findings
  ADD COLUMN IF NOT EXISTS rule_id uuid,
  ADD COLUMN IF NOT EXISTS completeness_weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz;

UPDATE esg.compliance_findings f
SET rule_id = r.id
FROM esg.compliance_rules r
WHERE f.rule_id IS NULL
  AND f.rule_code = r.code;

ALTER TABLE esg.compliance_findings
  ALTER COLUMN rule_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_findings_rule_id_fkey'
      AND conrelid = 'esg.compliance_findings'::regclass
  ) THEN
    ALTER TABLE esg.compliance_findings
      ADD CONSTRAINT compliance_findings_rule_id_fkey
      FOREIGN KEY (rule_id) REFERENCES esg.compliance_rules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compliance_findings_tenant_rule_period_key'
      AND conrelid = 'esg.compliance_findings'::regclass
  ) THEN
    ALTER TABLE esg.compliance_findings
      ADD CONSTRAINT compliance_findings_tenant_rule_period_key
      UNIQUE (tenant_id, rule_id, period_start, period_end);
  END IF;
END $$;

ALTER TABLE esg.compliance_findings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION esg.completeness_percent(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS numeric
LANGUAGE sql
STABLE AS $$
  SELECT COALESCE(
    round(
      (
        COALESCE(SUM(f.completeness_weight) FILTER (WHERE f.status = 'PASS'), 0)
        / NULLIF(COALESCE(SUM(f.completeness_weight), 0), 0)
      ) * 100,
      2
    ),
    0
  )
  FROM esg.compliance_findings f
  WHERE f.tenant_id = _tenant
    AND f.period_start = _pstart
    AND f.period_end = _pend
$$;

CREATE OR REPLACE FUNCTION esg.evaluate_brsr(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  ctx_tenant uuid := app.current_tenant();
  locked_key bigint;
  r record;
  prior_evidence text;
  pass_metric boolean;
  pass_evidence boolean;
  finding_status esg.finding_status;
  finding_reason text;
  finding_severity smallint;
  pass_count int := 0;
  fail_count int := 0;
  risk_count int := 0;
  total_count int := 0;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  locked_key := hashtextextended(_tenant::text || ':' || _pstart::text || ':' || _pend::text, 0);
  PERFORM pg_advisory_xact_lock(locked_key);

  FOR r IN
    SELECT id, code, framework, description, metric_code, requires_evidence, severity_level
    FROM esg.compliance_rules
    WHERE active = true AND framework = 'BRSR_CORE'
    ORDER BY code
  LOOP
    total_count := total_count + 1;

    SELECT evidence_url
      INTO prior_evidence
      FROM esg.compliance_findings
     WHERE tenant_id = _tenant
       AND rule_id = r.id
       AND period_start = _pstart
       AND period_end = _pend;

    IF r.metric_code IS NULL THEN
      pass_metric := true;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM esg.facts f
        WHERE f.tenant_id = _tenant
          AND f.period_start = _pstart
          AND f.period_end = _pend
          AND f.status = 'APPROVED'
          AND f.metric_code = r.metric_code
      ) INTO pass_metric;
    END IF;

    IF r.requires_evidence THEN
      pass_evidence := COALESCE(NULLIF(prior_evidence, ''), '') <> '';
    ELSE
      pass_evidence := true;
    END IF;

    IF pass_metric AND pass_evidence THEN
      finding_status := 'PASS';
      finding_reason := 'Rule satisfied';
      pass_count := pass_count + 1;
    ELSE
      finding_status := 'FAIL';
      finding_reason := CASE
        WHEN NOT pass_metric AND r.metric_code IS NOT NULL AND r.requires_evidence THEN 'Missing approved metric and evidence'
        WHEN NOT pass_metric AND r.metric_code IS NOT NULL THEN format('Missing approved %s', r.metric_code)
        WHEN NOT pass_evidence THEN 'Evidence missing'
        ELSE 'Rule failed'
      END;
      fail_count := fail_count + 1;
    END IF;

    finding_severity := CASE r.severity_level
      WHEN 'HIGH' THEN 5
      WHEN 'MEDIUM' THEN 3
      ELSE 1
    END;

    INSERT INTO esg.compliance_findings (
      tenant_id,
      rule_id,
      rule_code,
      period_start,
      period_end,
      status,
      severity,
      reason,
      data,
      evidence_url,
      completeness_weight,
      last_evaluated_at
    )
    VALUES (
      _tenant,
      r.id,
      r.code,
      _pstart,
      _pend,
      finding_status,
      finding_severity,
      finding_reason,
      jsonb_build_object(
        'framework', r.framework,
        'description', r.description,
        'metricCode', r.metric_code,
        'requiresEvidence', r.requires_evidence
      ),
      prior_evidence,
      1,
      now()
    )
    ON CONFLICT (tenant_id, rule_id, period_start, period_end)
    DO UPDATE SET
      rule_code = EXCLUDED.rule_code,
      status = EXCLUDED.status,
      severity = EXCLUDED.severity,
      reason = EXCLUDED.reason,
      data = EXCLUDED.data,
      completeness_weight = EXCLUDED.completeness_weight,
      last_evaluated_at = EXCLUDED.last_evaluated_at,
      updated_at = now();
  END LOOP;

  RETURN jsonb_build_object(
    'total', total_count,
    'pass', pass_count,
    'fail', fail_count,
    'risk', risk_count,
    'completeness', esg.completeness_percent(_tenant, _pstart, _pend)
  );
END $$;
