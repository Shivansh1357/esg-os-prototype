import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function withCtx<T>(tenant: string, user: string, fn: (c: any)=>Promise<T>){
  const c = await pool.connect();
  try{ await c.query('BEGIN');
       await c.query('SET LOCAL app.tenant_id = $1', [tenant]);
       await c.query('SET LOCAL app.user_id = $1', [user]);
       const out = await fn(c);
       await c.query('ROLLBACK'); return out;
  } finally { c.release(); }
}

describe('BRSR evaluate + resolve', () => {
  let tenant: string, entity: string;

  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      tenant = (await c.query(`INSERT INTO esg.tenants(name) VALUES('T-D4') RETURNING id`)).rows[0].id;
      entity = (await c.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG') RETURNING id`, [tenant]
      )).rows[0].id;
      await c.query('COMMIT');
    } finally { c.release(); }
  });

  it('creates FAIL for evidence-required then flips to PASS after attach', async () => {
    const p0 = '2025-07-01', p1 = '2025-09-30';
    const user = '00000000-0000-0000-0000-00000000cdef';

    await withCtx(tenant, user, async (c) => {
      await c.query(
        `INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
         VALUES ($1,$2,'ELEC_KWH',$3,$4,500,'kWh','APPROVED')`,
        [tenant, entity, p0, p1]
      );
      const s = await c.query(`SELECT esg.evaluate_brsr($1,$2,$3) summary`, [tenant, p0, p1]);
      expect(s.rows[0].summary.total).toBeDefined();
    });

    const finding = await withCtx(tenant, user, async (c) => {
      const r = await c.query(
        `SELECT id, status FROM esg.compliance_findings
          WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3 AND rule_code='BRSR-02'`,
        [tenant, p0, p1]
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].status).toBe('FAIL');
      return r.rows[0].id as string;
    });

    await withCtx(tenant, user, async (c) => {
      await c.query(
        `UPDATE esg.compliance_findings
            SET evidence_url=$1, status='PASS', reason='Evidence provided'
          WHERE id=$2`,
        ['s3://uploads/bill.pdf', finding]
      );
      await c.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenant, p0, p1]);
      const r = await c.query(`SELECT status FROM esg.compliance_findings WHERE id=$1`, [finding]);
      expect(r.rows[0].status).toBe('PASS');
    });
  });
});


