import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function as(tenantId: string, userId: string, sql: string, params: any[] = []) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL app.tenant_id = $1', [tenantId]);
    await c.query('SET LOCAL app.user_id = $1', [userId]);
    const res = await c.query(sql, params);
    await c.query('ROLLBACK');
    return res;
  } finally { c.release(); }
}

describe('RLS', () => {
  it('denies cross-tenant reads', async () => {
    const t1 = (await as('00000000-0000-0000-0000-000000000001','u1',`INSERT INTO esg.tenants(name) VALUES('T1') RETURNING id`)).rows[0].id;
    const t2 = (await as('00000000-0000-0000-0000-000000000002','u2',`INSERT INTO esg.tenants(name) VALUES('T2') RETURNING id`)).rows[0].id;
    await as(t1,'u1',`INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG')`,[t1]);
    const rs = await as(t2,'u2',`SELECT * FROM esg.entities`);
    expect(rs.rowCount).toBe(0);
  });
});


