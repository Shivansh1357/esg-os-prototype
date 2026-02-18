import { Args, Context, Float, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { pgClientFrom } from '../../db/reqpg';
import { Finding } from '../schema.gql';
import { requireRole } from '../../rbac/access';

@Resolver()
export class ComplianceResolver {
  @Query(() => [Finding])
  async gapMap(
    @Args('periodStart') periodStart: string,
    @Args('periodEnd') periodEnd: string,
    @Context() ctx?: { req: Request }
  ) {
    const client = pgClientFrom(ctx?.req as Request);
    const r = await client.query(
      `SELECT f.id, f.rule_code, f.status::text AS status, f.severity, f.reason, f.evidence_url, f.owner, f.due_date,
              f.completeness_weight, r.framework, r.description, r.metric_code, r.requires_evidence
         FROM esg.compliance_findings f
         JOIN esg.compliance_rules r ON r.id = f.rule_id
        WHERE f.tenant_id = app.current_tenant() AND f.period_start=$1 AND f.period_end=$2
        ORDER BY (f.status <> 'PASS') DESC, f.severity DESC, f.rule_code`,
      [periodStart, periodEnd]
    );
    return r.rows.map((x) => ({
      id: x.id,
      ruleCode: x.rule_code,
      status: x.status,
      severity: x.severity,
      reason: x.reason,
      framework: x.framework ?? null,
      description: x.description ?? null,
      metricCode: x.metric_code ?? null,
      requiresEvidence: !!x.requires_evidence,
      completenessWeight: Number(x.completeness_weight ?? 1),
      evidenceUrl: x.evidence_url ?? null,
      owner: x.owner ?? null,
      dueDate: x.due_date ? x.due_date.toISOString().slice(0,10) : null
    }));
  }

  @Mutation(() => Float)
  async resolveGap(
    @Args('id') id: string,
    @Args('evidenceUrl') evidenceUrl: string,
    @Context() ctx?: { req: Request }
  ) {
    requireRole('ADMIN', 'MEMBER');
    const client = pgClientFrom(ctx?.req as Request);
    const v = await client.query(`SELECT esg.validate_evidence_url($1) AS ok`, [evidenceUrl]);
    if (!v.rows[0]?.ok) throw new Error('Invalid evidence URL (must be under allowed bucket/domain)');

    const cur = await client.query(
      `SELECT id, period_start, period_end FROM esg.compliance_findings
        WHERE id=$1 AND tenant_id=app.current_tenant()
        FOR UPDATE`,
      [id]
    );
    if (cur.rowCount === 0) return 0;

    await client.query(
      `UPDATE esg.compliance_findings
          SET evidence_url=$1, status='PASS', reason='Evidence provided', updated_at=now()
        WHERE id=$2`,
      [evidenceUrl, id]
    );

    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    await client.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [t.rows[0].tid, cur.rows[0].period_start, cur.rows[0].period_end]);

    const pct = await client.query(
      `SELECT esg.completeness_percent($1,$2,$3) AS pct`,
      [t.rows[0].tid, cur.rows[0].period_start, cur.rows[0].period_end]
    );

    return Number(pct.rows[0].pct ?? 0);
  }
}


