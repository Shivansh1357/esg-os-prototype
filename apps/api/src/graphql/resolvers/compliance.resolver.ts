import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { pgClientFrom } from '../../db/reqpg';
import { Finding } from '../schema.gql';

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
      `SELECT id, rule_code, status::text AS status, severity, reason, evidence_url, owner, due_date
         FROM esg.compliance_findings
        WHERE tenant_id = app.current_tenant() AND period_start=$1 AND period_end=$2
        ORDER BY (status <> 'PASS') DESC, severity DESC, rule_code`,
      [periodStart, periodEnd]
    );
    return r.rows.map((x) => ({
      id: x.id,
      ruleCode: x.rule_code,
      status: x.status,
      severity: x.severity,
      reason: x.reason,
      evidenceUrl: x.evidence_url ?? null,
      owner: x.owner ?? null,
      dueDate: x.due_date ? x.due_date.toISOString().slice(0,10) : null
    }));
  }

  @Mutation(() => Boolean)
  async resolveGap(
    @Args('id') id: string,
    @Args('evidenceUrl') evidenceUrl: string,
    @Context() ctx?: { req: Request }
  ) {
    const client = pgClientFrom(ctx?.req as Request);
    const v = await client.query(`SELECT esg.validate_evidence_url($1) AS ok`, [evidenceUrl]);
    if (!v.rows[0]?.ok) throw new Error('Invalid evidence URL (must be under allowed bucket/domain)');

    const cur = await client.query(
      `SELECT id, period_start, period_end FROM esg.compliance_findings
        WHERE id=$1 AND tenant_id=app.current_tenant()
        FOR UPDATE`,
      [id]
    );
    if (cur.rowCount === 0) return false;

    await client.query(
      `UPDATE esg.compliance_findings
          SET evidence_url=$1, status='PASS', reason='Evidence provided', updated_at=now()
        WHERE id=$2`,
      [evidenceUrl, id]
    );

    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    await client.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [t.rows[0].tid, cur.rows[0].period_start, cur.rows[0].period_end]);

    return true;
  }
}


