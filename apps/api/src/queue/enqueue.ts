import { PoolClient } from 'pg';

export type RecalcPayload = {
  tenantId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  factorSetId: string;
};

export async function enqueueRecalc(client: PoolClient, payload: RecalcPayload) {
  const hasWorkerSchema = await client.query(`SELECT to_regnamespace('graphile_worker') AS ns`);
  if (!hasWorkerSchema.rows[0]?.ns) {
    await client.query(
      `SELECT esg.recalc_emissions($1, $2, $3, $4, $5)`,
      [payload.tenantId, payload.entityId, payload.periodStart, payload.periodEnd, payload.factorSetId]
    );
    return;
  }
  try {
    await client.query(
      `SELECT graphile_worker.add_job($1, $2::json, queue_name => $3, max_attempts => 5)`,
      ['calc.recalc', JSON.stringify(payload), 'calc']
    );
  } catch (error: any) {
    if (error?.code === '3F000') {
      await client.query(
        `SELECT esg.recalc_emissions($1, $2, $3, $4, $5)`,
        [payload.tenantId, payload.entityId, payload.periodStart, payload.periodEnd, payload.factorSetId]
      );
      return;
    }
    throw error;
  }
}


