import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

async function withCtx<T>(tenant: string, user: string, fn: (c: any)=>Promise<T>){
  const c = await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [user]);
    const out = await fn(c);
    await c.query('ROLLBACK');
    return out;
  } finally { c.release(); }
}

describe('compliance lifecycle e2e', () => {
  let tenant: string, entity: string;

  afterAll(async () => {
    await pool.end();
  });

  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      tenant = (await c.query(`INSERT INTO esg.tenants(name) VALUES('T-D4-E2E') RETURNING id`)).rows[0].id;
      entity = (await c.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG') RETURNING id`, [tenant]
      )).rows[0].id;
      await c.query('COMMIT');
    } finally { c.release(); }
  });

  it('moves completeness 0 to 50 to 100 with no duplicate findings', async () => {
    const p0 = '2025-10-01', p1 = '2025-12-31';
    const user = '00000000-0000-0000-0000-00000000d444';

    await withCtx(tenant, user, async (c) => {
      await c.query(`UPDATE esg.compliance_rules SET active=false WHERE framework='BRSR_CORE'`);
      const metricRuleId = (
        await c.query(
          `INSERT INTO esg.compliance_rules(
              id, code, framework, description, metric_code, requires_evidence, severity_level,
              title, category, severity, rule_type, params, active
            )
            VALUES (
              gen_random_uuid(), 'TEST-D4-E2E-METRIC', 'BRSR_CORE', 'Metric must exist', 'ELEC_KWH', false, 'MEDIUM',
              'Metric required', 'Energy', 3, 'REQUIRED_FACT', '{"metricCode":"ELEC_KWH"}'::jsonb, true
            )
            RETURNING id`
        )
      ).rows[0].id as string;
      const evidenceRuleId = (
        await c.query(
          `INSERT INTO esg.compliance_rules(
              id, code, framework, description, metric_code, requires_evidence, severity_level,
              title, category, severity, rule_type, params, active
            )
            VALUES (
              gen_random_uuid(), 'TEST-D4-E2E-EVIDENCE', 'BRSR_CORE', 'Evidence must exist', NULL, true, 'MEDIUM',
              'Evidence required', 'Governance', 3, 'EVIDENCE_REQUIRED', '{}'::jsonb, true
            )
            RETURNING id`
        )
      ).rows[0].id as string;

      await c.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenant, p0, p1]);
      const pct0 = await c.query(`SELECT esg.completeness_percent($1,$2,$3) AS pct`, [tenant, p0, p1]);
      expect(Number(pct0.rows[0].pct)).toBe(0);

      await c.query(
        `INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
         VALUES ($1,$2,'ELEC_KWH',$3,$4,777,'kWh','APPROVED')`,
        [tenant, entity, p0, p1]
      );
      await c.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenant, p0, p1]);
      const metricFinding = await c.query(
        `SELECT status FROM esg.compliance_findings
          WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3 AND rule_id=$4`,
        [tenant, p0, p1, metricRuleId]
      );
      const evidenceFinding = await c.query(
        `SELECT id, status FROM esg.compliance_findings
          WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3 AND rule_id=$4`,
        [tenant, p0, p1, evidenceRuleId]
      );
      expect(metricFinding.rows[0].status).toBe('PASS');
      expect(evidenceFinding.rows[0].status).toBe('FAIL');
      const pct50 = await c.query(`SELECT esg.completeness_percent($1,$2,$3) AS pct`, [tenant, p0, p1]);
      expect(Number(pct50.rows[0].pct)).toBe(50);

      await c.query(
        `UPDATE esg.compliance_findings SET evidence_url=$1 WHERE id=$2`,
        ['s3://uploads/d4-e2e-proof.pdf', evidenceFinding.rows[0].id]
      );
      await c.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenant, p0, p1]);
      const pct100 = await c.query(`SELECT esg.completeness_percent($1,$2,$3) AS pct`, [tenant, p0, p1]);
      expect(Number(pct100.rows[0].pct)).toBe(100);

      const countBefore = await c.query(
        `SELECT COUNT(*)::int AS n FROM esg.compliance_findings WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3`,
        [tenant, p0, p1]
      );
      await c.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenant, p0, p1]);
      const countAfter = await c.query(
        `SELECT COUNT(*)::int AS n FROM esg.compliance_findings WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3`,
        [tenant, p0, p1]
      );
      expect(countAfter.rows[0].n).toBe(countBefore.rows[0].n);
    });
  });
});
