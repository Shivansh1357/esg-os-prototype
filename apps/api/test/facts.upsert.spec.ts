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

describe('esg.upsert_fact', () => {
  let tenant: string; let entity: string;

  afterAll(async () => {
    await pool.end();
  });
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
    await withCtx(tenant, user, async (c) => {
      const first = (await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 100, 'kWh', 'CSV', 's3://x', user]
      )).rows[0].id as string;
      const second = (await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 100, 'kWh', 'CSV', 's3://x', user]
      )).rows[0].id as string;
      expect(second).toBe(first);
    });
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

  it('flags outliers and resets status to DRAFT on change', async () => {
    const user = '00000000-0000-0000-0000-0000000000cc';
    const p0 = '2025-07-01', p1 = '2025-09-30';

    // Seed prior quarters so stddev_pop > 0
    const prior = [
      ['2024-07-01','2024-09-30', 98],
      ['2024-10-01','2024-12-31', 102],
      ['2025-01-01','2025-03-31', 101],
      ['2025-04-01','2025-06-30', 99]
    ] as const;

    await withCtx(tenant, user, async (c) => {
      for (const [ps, pe, v] of prior) {
        await c.query(
          `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
          [tenant, entity, 'ELEC_KWH', ps, pe, v, 'kWh', 'CSV', 's3://seed', user]
        );
        await c.query(
          `UPDATE esg.facts SET status='APPROVED'
            WHERE tenant_id=$1 AND entity_id=$2 AND metric_code='ELEC_KWH' AND period_start=$3 AND period_end=$4`,
          [tenant, entity, ps, pe]
        );
      }

      const fid = (await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 9999, 'kWh', 'CSV', 's3://x', user]
      )).rows[0].id as string;

      const row = await c.query(
        `SELECT status, (quality_flags->>'outlier')::bool AS outlier
           FROM esg.facts WHERE id=$1`,
        [fid]
      );
      expect(row.rows[0].status).toBe('DRAFT');
      expect(row.rows[0].outlier).toBe(true);

      await c.query(`UPDATE esg.facts SET status='APPROVED' WHERE id=$1`, [fid]);

      const fid2 = (await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', p0, p1, 8888, 'kWh', 'CSV', 's3://x2', user]
      )).rows[0].id as string;
      expect(fid2).toBe(fid);

      const row2 = await c.query(
        `SELECT status FROM esg.facts WHERE id=$1`,
        [fid]
      );
      expect(row2.rows[0].status).toBe('DRAFT');

      const audit = await c.query(
        `SELECT action FROM esg.facts_audit WHERE fact_id=$1 ORDER BY id DESC LIMIT 1`,
        [fid]
      );
      expect(audit.rows[0].action).toBe('UPDATE');
    });
  });
});


