import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { requireRole } from '../rbac/access';

type ChecklistItem = { key: string; label: string; done: boolean };
type ChecklistOut = { percent: number; items: ChecklistItem[] };

@Controller()
export class PilotController {
  @Get('/pilot/onboarding/checklist')
  async checklist(@Req() req: Request): Promise<ChecklistOut> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);
    const r = await client.query(`SELECT esg.get_onboarding_checklist(app.current_tenant()) AS j`);
    const j = r.rows[0]?.j ?? { percent: 0, items: [] };
    return {
      percent: Number(j.percent ?? 0),
      items: Array.isArray(j.items) ? j.items : []
    };
  }

  @Post('/pilot/start-first-report')
  async startFirstReport(@Req() req: Request, @Body() body?: { name?: string; template?: string }) {
    requireRole('ADMIN', 'MEMBER');
    const client = pgClientFrom(req);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    const tid = t.rows[0].tid as string;
    const period = await client.query(`SELECT period_start, period_end FROM esg.default_report_period($1)`, [tid]);
    const periodStart = period.rows[0].period_start;
    const periodEnd = period.rows[0].period_end;

    const existing = await client.query(
      `SELECT id
         FROM esg.reports
        WHERE tenant_id = app.current_tenant()
          AND period_start = $1
          AND period_end = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [periodStart, periodEnd]
    );
    if ((existing.rowCount ?? 0) > 0) {
      return {
        reportId: existing.rows[0].id,
        periodStart: new Date(periodStart).toISOString().slice(0, 10),
        periodEnd: new Date(periodEnd).toISOString().slice(0, 10),
        created: false
      };
    }

    const reportName = body?.name || `First Report - ${periodStart.toISOString().slice(0, 10)}`;
    const template = body?.template || 'BRSR';
    const created = await client.query(
      `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
       VALUES(app.current_tenant(), $1, $2, $3, $4)
       RETURNING id`,
      [reportName, template, periodStart, periodEnd]
    );
    const reportId = created.rows[0].id as string;
    await client.query(
      `INSERT INTO esg.report_sections (tenant_id, report_id, code, title, status) VALUES
       (app.current_tenant(), $1, 'SUMMARY',    'Executive Summary', 'DRAFT'),
       (app.current_tenant(), $1, 'EMISSIONS',  'Emissions Overview', 'DRAFT'),
       (app.current_tenant(), $1, 'COMPLIANCE', 'BRSR Compliance', 'DRAFT')
       ON CONFLICT DO NOTHING`,
      [reportId]
    );
    return {
      reportId,
      periodStart: new Date(periodStart).toISOString().slice(0, 10),
      periodEnd: new Date(periodEnd).toISOString().slice(0, 10),
      created: true
    };
  }

  @Get('/pilot/metrics')
  async metrics(@Req() req: Request) {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT
          pm.tenant_id,
          pm.first_fact_at,
          pm.first_approval_at,
          pm.first_freeze_at,
          pm.first_exec_view_at,
          pm.supplier_invite_count,
          pm.feedback_count,
          CASE
            WHEN pm.first_fact_at IS NOT NULL AND pm.first_freeze_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (pm.first_freeze_at - pm.first_fact_at))
            ELSE NULL
          END AS time_to_first_report_seconds,
          CASE WHEN pm.first_approval_at IS NOT NULL THEN 100 ELSE 0 END AS approval_completion_rate,
          CASE WHEN pm.first_freeze_at IS NOT NULL THEN 100 ELSE 0 END AS freeze_completion_rate
        FROM esg.pilot_metrics pm
       WHERE pm.tenant_id = app.current_tenant()
       LIMIT 1`
    );
    if ((r.rowCount ?? 0) === 0) {
      return {
        timeToFirstReportSeconds: null,
        approvalCompletionRate: 0,
        freezeCompletionRate: 0,
        supplierInviteCount: 0,
        feedbackCount: 0
      };
    }
    const row = r.rows[0];
    return {
      firstFactAt: row.first_fact_at ? new Date(row.first_fact_at).toISOString() : null,
      firstApprovalAt: row.first_approval_at ? new Date(row.first_approval_at).toISOString() : null,
      firstFreezeAt: row.first_freeze_at ? new Date(row.first_freeze_at).toISOString() : null,
      firstExecViewAt: row.first_exec_view_at ? new Date(row.first_exec_view_at).toISOString() : null,
      supplierInviteCount: Number(row.supplier_invite_count ?? 0),
      feedbackCount: Number(row.feedback_count ?? 0),
      timeToFirstReportSeconds: row.time_to_first_report_seconds == null ? null : Number(row.time_to_first_report_seconds),
      approvalCompletionRate: Number(row.approval_completion_rate ?? 0),
      freezeCompletionRate: Number(row.freeze_completion_rate ?? 0)
    };
  }

  @Get('/pilot/stats')
  async stats(@Req() req: Request) {
    requireRole('ADMIN');
    const client = pgClientFrom(req);
    const tenant = await client.query(`SELECT id, name FROM esg.tenants WHERE id = app.current_tenant()`);
    const tenantRow = tenant.rows[0];
    const r = await client.query(
      `SELECT
          pm.tenant_id,
          pm.first_fact_at,
          pm.first_approval_at,
          pm.first_freeze_at,
          pm.first_exec_view_at,
          pm.supplier_invite_count,
          pm.feedback_count,
          GREATEST(
            COALESCE(pm.first_fact_at, '-infinity'::timestamptz),
            COALESCE(pm.first_approval_at, '-infinity'::timestamptz),
            COALESCE(pm.first_freeze_at, '-infinity'::timestamptz),
            COALESCE(pm.first_exec_view_at, '-infinity'::timestamptz),
            COALESCE((SELECT max(f.created_at) FROM esg.feedback f WHERE f.tenant_id = pm.tenant_id), '-infinity'::timestamptz)
          ) AS last_activity_at,
          CASE
            WHEN pm.first_fact_at IS NOT NULL AND pm.first_freeze_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (pm.first_freeze_at - pm.first_fact_at))
            ELSE NULL
          END AS time_to_first_report_seconds
        FROM esg.pilot_metrics pm
       WHERE pm.tenant_id = app.current_tenant()
       LIMIT 1`
    );
    const metrics = r.rows[0] ?? null;
    const feedback = await client.query(
      `SELECT avg(rating)::numeric(10,2) AS avg_rating
         FROM esg.feedback
        WHERE tenant_id = app.current_tenant()`
    );

    const perTenant = [{
      tenantId: tenantRow?.id ?? null,
      tenantName: tenantRow?.name ?? null,
      timeToFirstFact: metrics?.first_fact_at ? new Date(metrics.first_fact_at).toISOString() : null,
      timeToFirstFreeze: metrics?.first_freeze_at ? new Date(metrics.first_freeze_at).toISOString() : null,
      timeToFirstExecView: metrics?.first_exec_view_at ? new Date(metrics.first_exec_view_at).toISOString() : null,
      supplierInviteCount: Number(metrics?.supplier_invite_count ?? 0),
      freezeCompleted: !!metrics?.first_freeze_at,
      lastActivityAt: metrics?.last_activity_at ? new Date(metrics.last_activity_at).toISOString() : null,
      timeToFirstReportSeconds: metrics?.time_to_first_report_seconds == null ? null : Number(metrics.time_to_first_report_seconds),
      feedbackCount: Number(metrics?.feedback_count ?? 0)
    }];

    const freezeReached = perTenant.filter((x) => x.freezeCompleted).length;
    const supplierInvited = perTenant.filter((x) => x.supplierInviteCount > 0).length;

    return {
      tenants: perTenant,
      summary: {
        avgTimeToFirstReportSeconds: perTenant[0]?.timeToFirstReportSeconds ?? null,
        freezeReachPercent: perTenant.length ? Number(((freezeReached / perTenant.length) * 100).toFixed(2)) : 0,
        supplierInviteReachPercent: perTenant.length ? Number(((supplierInvited / perTenant.length) * 100).toFixed(2)) : 0,
        avgFeedbackRating: feedback.rows[0]?.avg_rating == null ? null : Number(feedback.rows[0].avg_rating)
      }
    };
  }
}
