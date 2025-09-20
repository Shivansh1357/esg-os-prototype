import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function withCtx<T>(tenant: string, user: string, fn: (c: any)=>Promise<T>){
  const c = await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('SET LOCAL app.tenant_id = $1', [tenant]);
    await c.query('SET LOCAL app.user_id = $1', [user]);
    const out = await fn(c);
    await c.query('ROLLBACK');
    return out;
  } finally { c.release(); }
}

describe('esg.upsert_fact', () => {
  let tenant: string; let entity: string;
  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const t = await c.query(`INSERT INTO esg.tenants(name) VALUES('T-D2') RETURNING id`);
      tenant = t.rows[0].id;
      const e = await c.query(`INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG') RETURNING id`, [tenant]);
      entity = e.rows[0].id;
      await c.query('COMMIT');
    } finally { c.release(); }
  });

  it('is idempotent on (tenant,entity,metric,pstart,pend)', async () => {
    const p0 = '2025-07-01', p1 = '2025-09-30';
    const user = '00000000-0000-0000-0000-0000000000aa';
    const first = await withCtx(tenant, user, async (c) => {
      const r = await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 100, 'kWh', 'CSV', 's3://x', user]
      ); return r.rows[0].id as string;
    });
    const second = await withCtx(tenant, user, async (c) => {
      const r = await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 100, 'kWh', 'CSV', 's3://x', user]
      ); return r.rows[0].id as string;
    });
    expect(second).toBe(first);
  });

  it('writes audit row and approves with row lock', async () => {
    const user = '00000000-0000-0000-0000-0000000000bb';
    const p0 = '2025-07-01', p1 = '2025-09-30';
    let fid: string;
    await withCtx(tenant, user, async (c) => {
      fid = (await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 101, 'kWh', 'CSV', 's3://x', user]
      )).rows[0].id;
      const a1 = await c.query(`SELECT count(*)::int AS n FROM esg.facts_audit WHERE fact_id=$1`, [fid]);
      expect(a1.rows[0].n).toBeGreaterThan(0);
      await c.query(`SELECT id FROM esg.facts WHERE id=$1 FOR UPDATE`, [fid]);
      await c.query(`UPDATE esg.facts SET status='APPROVED' WHERE id=$1`, [fid]);
      const a2 = await c.query(`SELECT count(*)::int AS n FROM esg.facts_audit WHERE fact_id=$1 AND action='APPROVE'`, [fid]);
      expect(a2.rows[0].n).toBe(1);
    });
  });
});


