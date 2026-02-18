const { Pool } = require('pg');

async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:esg@localhost:5432/esg-os';
  const tenantId = process.env.E2E_TENANT_ID || '00000000-0000-0000-0000-00000000e2e1';
  const userId = process.env.E2E_USER_ID || '00000000-0000-0000-0000-00000000e2e2';
  const entityId = process.env.E2E_ENTITY_ID || '00000000-0000-0000-0000-000000000001';

  process.env.NEXT_PUBLIC_TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || tenantId;
  process.env.NEXT_PUBLIC_USER_ID = process.env.NEXT_PUBLIC_USER_ID || userId;
  process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO esg.tenants(id, name)
       VALUES ($1, 'E2E Tenant')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [tenantId]
    );
    await client.query(
      `INSERT INTO esg.entities(id, tenant_id, name, etype)
       VALUES ($1, $2, 'E2E ORG Root', 'ORG')
       ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name, etype = EXCLUDED.etype`,
      [entityId, tenantId]
    );
    const fs = await client.query(`SELECT id FROM esg.factor_sets ORDER BY created_at LIMIT 1`);
    if (fs.rowCount) {
      await client.query(
        `INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id = EXCLUDED.factor_set_id, updated_at = now()`,
        [tenantId, fs.rows[0].id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

}

module.exports = globalSetup;
