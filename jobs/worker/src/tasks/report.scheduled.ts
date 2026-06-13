import type { Task } from 'graphile-worker';
import { Pool } from 'pg';

type Format = 'pdf' | 'xlsx' | 'brsr';

type Payload = {
  tenantId: string;
  reportId: string;
  format: Format;
  scheduleId?: string;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VALID_FORMATS: ReadonlySet<string> = new Set(['pdf', 'xlsx', 'brsr']);

function isPayload(payload: unknown): payload is Payload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.tenantId === 'string' &&
    typeof p.reportId === 'string' &&
    typeof p.format === 'string' &&
    VALID_FORMATS.has(p.format) &&
    (p.scheduleId === undefined || typeof p.scheduleId === 'string')
  );
}

/**
 * Calls the API export endpoint to generate a report in the requested format.
 * The API host is resolved from API_BASE_URL env var (defaults to localhost:5051).
 */
async function callExportEndpoint(
  tenantId: string,
  reportId: string,
  format: Format,
): Promise<{ status: number; ok: boolean; body: string }> {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:5051';
  const url = `${apiBase}/reports/${reportId}/export`;

  // Use built-in fetch (Node 18+) with a timeout via AbortController.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        // Internal service-to-service auth token
        ...(process.env.INTERNAL_SERVICE_TOKEN
          ? { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ format }),
      signal: controller.signal,
    });
    const body = await res.text();
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

const task: Task = async (payload, { logger, job }) => {
  if (!isPayload(payload)) {
    logger.error('report.scheduled FAIL: invalid payload');
    throw new Error('Invalid report.scheduled payload');
  }

  const { tenantId, reportId, format, scheduleId } = payload;
  const started = Date.now();
  const client = await pool.connect();

  try {
    // 1. Set tenant context and verify the report exists via the export payload function
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      '00000000-0000-0000-0000-000000000001',
    ]);

    const exportPayload = await client.query(
      `SELECT esg.get_report_export_payload($1, $2) AS payload`,
      [tenantId, reportId],
    );

    if (!exportPayload.rows[0]?.payload) {
      throw new Error(`Report ${reportId} not found for tenant ${tenantId}`);
    }

    await client.query('COMMIT');

    // 2. Call the API export endpoint to generate the actual file (PDF/XLSX/BRSR)
    logger.info(
      `report.scheduled START tenant=${tenantId} report=${reportId} format=${format}`,
    );

    const result = await callExportEndpoint(tenantId, reportId, format);

    if (!result.ok) {
      throw new Error(
        `Export API returned ${result.status}: ${result.body.slice(0, 500)}`,
      );
    }

    // 3. Update schedule tracking if this was triggered by a schedule
    if (scheduleId) {
      const trackClient = await pool.connect();
      try {
        await trackClient.query('BEGIN');
        await trackClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [
          tenantId,
        ]);
        await trackClient.query(`SELECT set_config('app.user_id', $1, true)`, [
          '00000000-0000-0000-0000-000000000001',
        ]);

        await trackClient.query(
          `UPDATE esg.report_schedules
              SET last_run_at = now(),
                  next_run_at = esg.next_cron_run(cron_expression)
            WHERE id = $1
              AND tenant_id = $2`,
          [scheduleId, tenantId],
        );

        // Insert a notification for the completed report. The dedup key is the
        // graphile-worker job id: it is stable across retries of THIS job (so a
        // retry won't duplicate the notification) but unique per scheduled run.
        await trackClient.query(
          `INSERT INTO esg.notifications (tenant_id, type, title, body, link, dedup_key)
           VALUES ($1, 'REPORT_READY', $2, $3, $4, $5)
           ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING`,
          [
            tenantId,
            `Scheduled ${format.toUpperCase()} report generated`,
            `Your scheduled ${format.toUpperCase()} report has been generated successfully.`,
            `/reports/${reportId}`,
            `report_ready:job:${job.id}`,
          ],
        );

        await trackClient.query('COMMIT');
      } catch (err) {
        await trackClient.query('ROLLBACK');
        // Log but don't fail the task for tracking errors
        logger.error(
          `report.scheduled WARN: failed to update schedule tracking: ${(err as Error).message}`,
        );
      } finally {
        trackClient.release();
      }
    }

    const durationMs = Date.now() - started;
    logger.info(
      `report.scheduled OK tenant=${tenantId} report=${reportId} format=${format} duration_ms=${durationMs}`,
    );
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    const durationMs = Date.now() - started;
    logger.error(
      `report.scheduled FAIL tenant=${tenantId} report=${reportId} format=${format} duration_ms=${durationMs} error=${(e as Error).message}`,
    );
    throw e;
  } finally {
    client.release();
  }
};

export default task;
