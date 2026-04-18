import { PoolClient } from 'pg';
import { incMetric, observeMetric } from '../observability/metrics';

export type RecalcPayload = {
  tenantId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  factorSetId: string;
};

export async function enqueueRecalc(client: PoolClient, payload: RecalcPayload) {
  const startedAt = Date.now();
  const recalcJobKey = [
    payload.tenantId,
    payload.entityId,
    payload.periodStart,
    payload.periodEnd,
    payload.factorSetId,
  ].join(':');

  const hasWorkerSchema = await client.query(`SELECT to_regnamespace('graphile_worker') AS ns`);
  if (!hasWorkerSchema.rows[0]?.ns) {
    await client.query(
      `SELECT esg.recalc_emissions($1, $2, $3, $4, $5)`,
      [payload.tenantId, payload.entityId, payload.periodStart, payload.periodEnd, payload.factorSetId]
    );
    incMetric('recalc_inline_total');
    observeMetric('recalc_duration_ms', Date.now() - startedAt);
    return;
  }

  let dedupCandidate = false;
  try {
    const existing = await client.query<{ n: number | string }>(
      `SELECT count(*)::int AS n
         FROM graphile_worker.jobs
        WHERE key = $1
          AND attempts < max_attempts`,
      [recalcJobKey]
    );
    dedupCandidate = Number(existing.rows[0]?.n ?? 0) > 0;
  } catch {
    dedupCandidate = false;
  }

  try {
    await client.query(
      `SELECT graphile_worker.add_job($1, $2::json, queue_name => $3, max_attempts => 5, job_key => $4, job_key_mode => 'preserve_run_at')`,
      ['calc.recalc', JSON.stringify(payload), 'calc', recalcJobKey]
    );
    incMetric('recalc_enqueue_total');
    if (dedupCandidate) incMetric('recalc_enqueue_dedup_total');
  } catch (error: any) {
    if (error?.code === '3F000') {
      await client.query(
        `SELECT esg.recalc_emissions($1, $2, $3, $4, $5)`,
        [payload.tenantId, payload.entityId, payload.periodStart, payload.periodEnd, payload.factorSetId]
      );
      incMetric('recalc_inline_total');
      observeMetric('recalc_duration_ms', Date.now() - startedAt);
      return;
    }
    throw error;
  }
}
