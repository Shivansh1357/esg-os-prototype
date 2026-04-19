import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type ActivityEvent = {
  id: string;
  category: 'FACT' | 'COMPLIANCE' | 'FREEZE' | 'SUPPLIER';
  action: string;
  at: string;
  actor: string | null;
  payload: Record<string, unknown>;
};

type ActivitySummary = {
  factsCreated: number;
  complianceEvaluations: number;
  freezes: number;
  supplierSubmissions: number;
};

type ActivityResponse = {
  events: ActivityEvent[];
  summary: ActivitySummary;
};

@Controller()
export class ActivityController {
  @Get('/admin/activity')
  async activity(@Req() req: Request): Promise<ActivityResponse> {
    requireRole('ADMIN', 'MEMBER');
    enforceRateLimit('admin_activity', 30, 60_000);
    const client = pgClientFrom(req);

    const eventsResult = await client.query(
      `
      WITH cutoff AS (SELECT (now() - interval '30 days')::timestamptz AS ts),
      facts AS (
        SELECT
          fa.id::text AS id,
          'FACT'::text AS category,
          fa.action::text AS action,
          fa.at AS at,
          fa.actor_id::text AS actor,
          jsonb_build_object('factId', fa.fact_id) AS payload
        FROM esg.facts_audit fa, cutoff
        WHERE fa.tenant_id = app.current_tenant()
          AND fa.at >= cutoff.ts
      ),
      compliance AS (
        SELECT
          cf.id::text AS id,
          'COMPLIANCE'::text AS category,
          'EVALUATE'::text AS action,
          cf.updated_at AS at,
          NULL::text AS actor,
          jsonb_build_object('ruleCode', cf.rule_code, 'status', cf.status) AS payload
        FROM esg.compliance_findings cf, cutoff
        WHERE cf.tenant_id = app.current_tenant()
          AND cf.updated_at >= cutoff.ts
      ),
      freezes AS (
        SELECT
          rf.id::text AS id,
          'FREEZE'::text AS category,
          'FREEZE_REPORT'::text AS action,
          rf.frozen_at AS at,
          rf.frozen_by::text AS actor,
          jsonb_build_object('reportId', rf.report_id, 'versionMajor', rf.version_major) AS payload
        FROM esg.report_freezes rf, cutoff
        WHERE rf.tenant_id = app.current_tenant()
          AND rf.frozen_at >= cutoff.ts
      ),
      suppliers AS (
        SELECT
          sr.id::text AS id,
          'SUPPLIER'::text AS category,
          CASE WHEN sr.approved THEN 'SUPPLIER_APPROVED' ELSE 'SUPPLIER_SUBMITTED' END::text AS action,
          sr.submitted_at AS at,
          NULL::text AS actor,
          jsonb_build_object('supplierId', sr.supplier_id, 'approved', sr.approved) AS payload
        FROM esg.supplier_responses sr, cutoff
        WHERE sr.tenant_id = app.current_tenant()
          AND sr.submitted_at >= cutoff.ts
      )
      SELECT * FROM (
        SELECT * FROM facts
        UNION ALL SELECT * FROM compliance
        UNION ALL SELECT * FROM freezes
        UNION ALL SELECT * FROM suppliers
      ) e
      ORDER BY e.at DESC
      LIMIT 200
      `
    );

    const summaryResult = await client.query(
      `
      WITH cutoff AS (SELECT (now() - interval '30 days')::timestamptz AS ts)
      SELECT
        (SELECT count(*) FROM esg.facts_audit fa, cutoff
         WHERE fa.tenant_id = app.current_tenant()
           AND fa.action = 'INSERT'
           AND fa.at >= cutoff.ts)::int AS facts_created,
        (SELECT count(*) FROM esg.compliance_findings cf, cutoff
         WHERE cf.tenant_id = app.current_tenant()
           AND cf.updated_at >= cutoff.ts)::int AS compliance_evaluations,
        (SELECT count(*) FROM esg.report_freezes rf, cutoff
         WHERE rf.tenant_id = app.current_tenant()
           AND rf.frozen_at >= cutoff.ts)::int AS freezes,
        (SELECT count(*) FROM esg.supplier_responses sr, cutoff
         WHERE sr.tenant_id = app.current_tenant()
           AND sr.submitted_at >= cutoff.ts)::int AS supplier_submissions
      `
    );

    const s = summaryResult.rows[0];

    return {
      events: eventsResult.rows.map((x) => ({
        id: x.id,
        category: x.category as ActivityEvent['category'],
        action: x.action,
        at: new Date(x.at).toISOString(),
        actor: x.actor ?? null,
        payload: x.payload
      })),
      summary: {
        factsCreated: s.facts_created,
        complianceEvaluations: s.compliance_evaluations,
        freezes: s.freezes,
        supplierSubmissions: s.supplier_submissions
      }
    };
  }
}
