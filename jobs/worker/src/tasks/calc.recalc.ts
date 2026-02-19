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

function isPayload(payload: unknown): payload is Payload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.tenantId === 'string' &&
    typeof p.entityId === 'string' &&
    typeof p.periodStart === 'string' &&
    typeof p.periodEnd === 'string' &&
    typeof p.factorSetId === 'string'
  );
}

const task: Task = async (payload, { logger }) => {
  if (!isPayload(payload)) {
    logger.error('calc.recalc FAIL: invalid payload');
    throw new Error('Invalid calc.recalc payload');
  }
  const { tenantId, entityId, periodStart, periodEnd, factorSetId } = payload;
  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, ['00000000-0000-0000-0000-000000000001']);
    const res = await client.query(
      `SELECT (esg.recalc_emissions($1,$2,$3,$4,$5)).id AS id`,
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

