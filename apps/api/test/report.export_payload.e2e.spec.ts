import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

async function withCtx<T>(tenant: string, user: string, fn: (c: any)=>Promise<T>){
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [user]);
    const out = await fn(c);
    await c.query('ROLLBACK');
    return out;
  } finally { c.release(); }
}

describe('report export payload snapshot hardening', () => {
  let tenant: string;
  let entity: string;

  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      tenant = (await c.query(`INSERT INTO esg.tenants(name) VALUES('T-D6-PAYLOAD') RETURNING id`)).rows[0].id;
      entity = (await c.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG') RETURNING id`, [tenant]
      )).rows[0].id;
      await c.query('COMMIT');
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns live payload for draft and frozen snapshot for locked reports', async () => {
    const user = '00000000-0000-0000-0000-00000000d600';
    const p0 = '2025-07-01';
    const p1 = '2025-09-30';

    await withCtx(tenant, user, async (c) => {
      const fsid = (await c.query(
        `SELECT id FROM esg.factor_sets ORDER BY created_at LIMIT 1`
      )).rows[0].id as string;
      await c.query(
        `INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id) VALUES ($1,$2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
        [tenant, fsid]
      );

      const factId = (await c.query(
        `INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
         VALUES ($1,$2,'ELEC_KWH',$3,$4,420,'kWh','APPROVED') RETURNING id`,
        [tenant, entity, p0, p1]
      )).rows[0].id as string;

      await c.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [tenant, entity, p0, p1, fsid]);
      await c.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenant, p0, p1]);

      const reportId = (await c.query(
        `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
         VALUES ($1,'D6 Export','BRSR',$2,$3) RETURNING id`,
        [tenant, p0, p1]
      )).rows[0].id as string;

      const draft = await c.query(`SELECT esg.get_report_export_payload($1,$2) AS p`, [tenant, reportId]);
      expect(draft.rows[0].p.mode).toBe('live');

      await c.query(`SELECT esg.freeze_report($1,$2,$3)`, [tenant, reportId, user]);
      const frozenRow = await c.query(`SELECT is_locked, locked FROM esg.reports WHERE id=$1`, [reportId]);
      expect(frozenRow.rows[0].is_locked || frozenRow.rows[0].locked).toBe(true);
      const snap = (await c.query(`SELECT compliance_snapshot FROM esg.reports WHERE id=$1`, [reportId]))
        .rows[0].compliance_snapshot;

      let blockedFactUpdate = false;
      await c.query(`SAVEPOINT sp_fact_update`);
      try {
        await c.query(`UPDATE esg.facts SET value=value+1 WHERE id=$1`, [factId]);
      } catch (e: any) {
        blockedFactUpdate = e.code === '55000';
        await c.query(`ROLLBACK TO SAVEPOINT sp_fact_update`);
      }
      await c.query(`RELEASE SAVEPOINT sp_fact_update`);
      expect(blockedFactUpdate).toBe(true);

      let blockedRecalc = false;
      await c.query(`SAVEPOINT sp_recalc`);
      try {
        await c.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [tenant, entity, p0, p1, fsid]);
      } catch (e: any) {
        blockedRecalc = e.code === '55000';
        await c.query(`ROLLBACK TO SAVEPOINT sp_recalc`);
      }
      await c.query(`RELEASE SAVEPOINT sp_recalc`);
      expect(blockedRecalc).toBe(true);

      await c.query(
        `UPDATE esg.emission_totals
            SET scope1 = 888888
          WHERE tenant_id=$1 AND entity_id=$2 AND period_start=$3 AND period_end=$4 AND factor_set_id=$5`,
        [tenant, entity, p0, p1, fsid]
      );
      await c.query(
        `UPDATE esg.compliance_findings
            SET status='RISK', reason='tampered'
          WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3`,
        [tenant, p0, p1]
      );

      const locked = await c.query(`SELECT esg.get_report_export_payload($1,$2) AS p`, [tenant, reportId]);
      expect(locked.rows[0].p.mode).toBe('snapshot');
      expect(Number(locked.rows[0].p.totals.s1)).not.toBe(888888);
      expect(locked.rows[0].p.complianceFindings).toEqual(snap);
    });
  });
});
