import { PoolClient } from 'pg';

export async function getDefaultFactorSetId(client: PoolClient): Promise<string> {
  const r = await client.query(
    `SELECT td.factor_set_id AS id
       FROM esg.tenant_defaults td
      WHERE td.tenant_id = app.current_tenant()`
  );
  if (r.rowCount === 1) return r.rows[0].id as string;

  const r2 = await client.query(`SELECT id FROM esg.factor_sets WHERE code='IN-CEA-2024'`);
  if (r2.rowCount === 0) throw new Error('No factor set available');
  await client.query(
    `INSERT INTO esg.tenant_defaults (tenant_id, factor_set_id)
     VALUES (app.current_tenant(), $1)
     ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
    [r2.rows[0].id]
  );
  return r2.rows[0].id as string;
}


