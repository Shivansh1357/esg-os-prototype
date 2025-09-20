ALTER TABLE esg.reports
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version_major int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_minor int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_by uuid;

CREATE TABLE IF NOT EXISTS esg.report_freezes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  report_id     uuid NOT NULL REFERENCES esg.reports(id) ON DELETE CASCADE,
  version_major int NOT NULL,
  version_minor int NOT NULL,
  frozen_at     timestamptz NOT NULL DEFAULT now(),
  frozen_by     uuid,
  snapshot      jsonb NOT NULL,
  UNIQUE (tenant_id, report_id, version_major, version_minor)
);

ALTER TABLE esg.report_freezes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS report_freezes_rls ON esg.report_freezes
  FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant());

CREATE OR REPLACE FUNCTION esg.report_lineage(
  _tenant uuid,
  _report uuid
) RETURNS jsonb
LANGUAGE sql STABLE AS $$
WITH rpt AS (
  SELECT id, tenant_id, name, template, period_start, period_end,
         version_major, version_minor, locked
    FROM esg.reports
   WHERE id = _report AND tenant_id = _tenant
),
fs AS (
  SELECT td.factor_set_id AS id, fs.code, fs.name, fs.version
    FROM esg.tenant_defaults td
    JOIN esg.factor_sets fs ON fs.id = td.factor_set_id
   WHERE td.tenant_id = _tenant
   LIMIT 1
),
ents AS (
  SELECT e.id, e.name FROM esg.entities e WHERE e.tenant_id = _tenant
),
tot AS (
  SELECT t.entity_id, t.scope1, t.scope2_loc, t.scope2_mkt, t.scope3
    FROM esg.emission_totals t
    JOIN rpt r ON r.tenant_id = t.tenant_id
   WHERE t.tenant_id = _tenant
     AND t.period_start = (SELECT period_start FROM rpt)
     AND t.period_end   = (SELECT period_end FROM rpt)
     AND t.factor_set_id = (SELECT id FROM fs)
),
fx AS (
  SELECT ef.metric_code, ef.unit, ef.loc_kgco2e_per_unit AS loc, ef.mkt_kgco2e_per_unit AS mkt
    FROM esg.emission_factors ef WHERE ef.factor_set_id = (SELECT id FROM fs)
),
facts AS (
  SELECT f.id, f.entity_id, f.metric_code, f.unit, f.value, f.source_ref, f.updated_at,
         ((f.quality_flags->>'outlier')::bool) AS outlier, fx.loc, fx.mkt
    FROM esg.facts f
    JOIN rpt r ON r.period_start=f.period_start AND r.period_end=f.period_end AND r.tenant_id=f.tenant_id
    LEFT JOIN fx ON fx.metric_code=f.metric_code AND fx.unit=f.unit
   WHERE f.tenant_id = _tenant AND f.status = 'APPROVED'
),
evid AS (
  SELECT rule_code, evidence_url, reason, status::text AS status
    FROM esg.compliance_findings
    JOIN rpt r ON r.period_start=period_start AND r.period_end=period_end AND r.tenant_id=tenant_id
   WHERE tenant_id = _tenant AND evidence_url IS NOT NULL
)
SELECT jsonb_build_object(
  'report', jsonb_build_object(
    'id',(SELECT id FROM rpt),
    'name',(SELECT name FROM rpt),
    'template',(SELECT template FROM rpt),
    'periodStart',(SELECT period_start FROM rpt),
    'periodEnd',(SELECT period_end FROM rpt),
    'version', (SELECT format('%s.%s',version_major,version_minor) FROM rpt),
    'locked',(SELECT locked FROM rpt)
  ),
  'factorSet', to_jsonb((SELECT fs FROM fs)),
  'entities', (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'totals', to_jsonb((SELECT t FROM (SELECT scope1, scope2_loc, scope2_mkt, scope3 FROM tot WHERE entity_id=e.id) t)),
        'facts', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'metricCode', f.metric_code,
              'unit', f.unit,
              'value', f.value,
              'sourceRef', f.source_ref,
              'approvedAt', f.updated_at,
              'outlier', coalesce(f.outlier,false),
              'factors', jsonb_build_object('loc', f.loc, 'mkt', f.mkt)
            ) ORDER BY f.metric_code, f.updated_at), '[]'::jsonb)
          FROM facts f WHERE f.entity_id = e.id
        )
      ) ORDER BY e.name)
    FROM ents e
  ),
  'evidence', (SELECT coalesce(jsonb_agg(to_jsonb(evid)), '[]'::jsonb) FROM evid),
  'notes', (SELECT coalesce(jsonb_agg(jsonb_build_object('metricCode', fx.metric_code, 'unit', fx.unit, 'locFactor', fx.loc, 'mktFactor', fx.mkt) ORDER BY fx.metric_code), '[]'::jsonb) FROM fx)
);
$$;

CREATE OR REPLACE FUNCTION esg.freeze_report(
  _tenant uuid,
  _report uuid,
  _actor  uuid
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE ctx_tenant uuid := current_setting('app.tenant_id', true)::uuid; mj int; mn int; snap jsonb;
BEGIN
  IF ctx_tenant IS NULL OR ctx_tenant <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;
  UPDATE esg.reports
     SET version_minor = version_minor + 1,
         locked = true,
         frozen_at = now(),
         frozen_by = _actor
   WHERE id = _report AND tenant_id = _tenant;
  SELECT version_major, version_minor INTO mj, mn FROM esg.reports WHERE id=_report AND tenant_id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'report not found'; END IF;
  snap := esg.report_lineage(_tenant, _report);
  INSERT INTO esg.report_freezes(tenant_id, report_id, version_major, version_minor, frozen_at, frozen_by, snapshot)
  VALUES (_tenant, _report, mj, mn, now(), _actor, snap)
  ON CONFLICT (tenant_id, report_id, version_major, version_minor) DO NOTHING;
END; $$;


