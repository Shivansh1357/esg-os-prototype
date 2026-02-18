import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { requireRole } from '../rbac/access';

type AuditEvent = {
  id: string;
  category: 'FACT' | 'COMPLIANCE' | 'FREEZE' | 'SUPPLIER';
  action: string;
  at: string;
  actor: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  payload: any;
};

@Controller()
export class AuditController {
  @Get('/audit/events')
  async events(
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @Req() req: Request
  ): Promise<AuditEvent[]> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);
    const r = await client.query(
      `
      WITH facts AS (
        SELECT
          fa.id::text AS id,
          'FACT'::text AS category,
          fa.action::text AS action,
          fa.at AS at,
          fa.actor_id::text AS actor,
          COALESCE((fa.after_row->>'period_start')::date, (fa.before_row->>'period_start')::date) AS period_start,
          COALESCE((fa.after_row->>'period_end')::date, (fa.before_row->>'period_end')::date) AS period_end,
          jsonb_build_object('factId', fa.fact_id, 'after', fa.after_row, 'before', fa.before_row) AS payload
        FROM esg.facts_audit fa
        WHERE fa.tenant_id = app.current_tenant()
      ),
      compliance AS (
        SELECT
          cf.id::text AS id,
          'COMPLIANCE'::text AS category,
          'EVALUATE'::text AS action,
          cf.updated_at AS at,
          NULL::text AS actor,
          cf.period_start,
          cf.period_end,
          jsonb_build_object('ruleCode', cf.rule_code, 'status', cf.status, 'reason', cf.reason, 'evidenceUrl', cf.evidence_url) AS payload
        FROM esg.compliance_findings cf
        WHERE cf.tenant_id = app.current_tenant()
      ),
      freezes AS (
        SELECT
          rf.id::text AS id,
          'FREEZE'::text AS category,
          'FREEZE_REPORT'::text AS action,
          rf.frozen_at AS at,
          rf.frozen_by::text AS actor,
          r.period_start,
          r.period_end,
          jsonb_build_object('reportId', rf.report_id, 'versionMajor', rf.version_major, 'versionMinor', rf.version_minor) AS payload
        FROM esg.report_freezes rf
        JOIN esg.reports r ON r.id = rf.report_id AND r.tenant_id = rf.tenant_id
        WHERE rf.tenant_id = app.current_tenant()
      ),
      suppliers AS (
        SELECT
          sr.id::text AS id,
          'SUPPLIER'::text AS category,
          CASE WHEN sr.approved THEN 'SUPPLIER_APPROVED' ELSE 'SUPPLIER_SUBMITTED' END::text AS action,
          sr.submitted_at AS at,
          NULL::text AS actor,
          sr.period_start,
          sr.period_end,
          jsonb_build_object('supplierId', sr.supplier_id, 'approved', sr.approved, 'emissionsKgCO2e', sr.emissions_kgco2e) AS payload
        FROM esg.supplier_responses sr
        WHERE sr.tenant_id = app.current_tenant()
      )
      SELECT * FROM (
        SELECT * FROM facts
        UNION ALL SELECT * FROM compliance
        UNION ALL SELECT * FROM freezes
        UNION ALL SELECT * FROM suppliers
      ) e
      WHERE ($1::date IS NULL OR e.period_start = $1::date)
        AND ($2::date IS NULL OR e.period_end = $2::date)
      ORDER BY e.at DESC
      LIMIT 500
      `,
      [periodStart || null, periodEnd || null]
    );

    return r.rows.map((x) => ({
      id: x.id,
      category: x.category,
      action: x.action,
      at: new Date(x.at).toISOString(),
      actor: x.actor ?? null,
      periodStart: x.period_start ? x.period_start.toISOString().slice(0, 10) : null,
      periodEnd: x.period_end ? x.period_end.toISOString().slice(0, 10) : null,
      payload: x.payload
    }));
  }
}

