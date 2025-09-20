import type { Task } from 'graphile-worker';
import { Pool } from 'pg';

type Payload = {
  tenantId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  factorSetId: string;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const task: Task = async (payload: Payload, { logger }) => {
  const { tenantId, entityId, periodStart, periodEnd, factorSetId } = payload;
  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
    await client.query('SET LOCAL app.user_id = $1', ['00000000-0000-0000-0000-00000000WORK']);
    const res = await client.query(
      `SELECT id FROM esg.recalc_emissions($1,$2,$3,$4,$5)`,
      [tenantId, entityId, periodStart, periodEnd, factorSetId]
    );
    await client.query('COMMIT');
    logger.info(`calc.recalc OK entity=${entityId} ${periodStart}..${periodEnd} fs=${factorSetId} in ${Date.now()-started}ms (row=${res.rows[0]?.id})`);
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error(`calc.recalc FAIL: ${(e as Error).message}`);
    throw e;
  } finally {
    client.release();
  }
};

export default task;


