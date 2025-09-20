import { PoolClient } from 'pg';

export type RecalcPayload = {
  tenantId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  factorSetId: string;
};

export async function enqueueRecalc(client: PoolClient, payload: RecalcPayload) {
  await client.query(
    `SELECT graphile_worker.add_job($1, $2::json, queue_name => $3, max_attempts => 5)`,
    ['calc.recalc', JSON.stringify(payload), 'calc']
  );
}


