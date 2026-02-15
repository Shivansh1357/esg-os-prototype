import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

async function as(tenantId: string, userId: string, sql: string, params: any[] = []) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL row_security = on');
    await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    const res = await c.query(sql, params);
    await c.query('ROLLBACK');
    return res;
  } finally { c.release(); }
}

describe('RLS', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('isolates reads by current tenant context', async () => {
    const c = await pool.connect();
    let t1: string;
    let t2: string;
    try {
      await c.query('BEGIN');
      t1 = (await c.query(`INSERT INTO esg.tenants(name) VALUES('T1') RETURNING id`)).rows[0].id;
      t2 = (await c.query(`INSERT INTO esg.tenants(name) VALUES('T2') RETURNING id`)).rows[0].id;
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [t1]);
      await c.query(`SELECT set_config('app.user_id', $1, true)`, ['u1']);
      await c.query(`INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG')`, [t1]);
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    const rs = await as(t2,'u2',`SELECT * FROM esg.entities WHERE tenant_id = app.current_tenant()`);
    expect(rs.rowCount).toBe(0);
  });
});


