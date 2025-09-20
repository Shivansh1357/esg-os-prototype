import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { pgClientFrom } from '../../db/reqpg';

@Resolver()
export class ReportsResolver {
  @Mutation(() => String)
  async createReport(
    @Args('name') name: string,
    @Args('template') template: string,
    @Context() ctx: any
  ) {
    const client = pgClientFrom(ctx.req as Request);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    const tid = t.rows[0].tid as string;
    const period = await client.query(`SELECT period_start, period_end FROM esg.default_report_period($1)`, [tid]);
    const ps = period.rows[0].period_start;
    const pe = period.rows[0].period_end;
    const r = await client.query(
      `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
       VALUES(app.current_tenant(), $1, $2, $3, $4) RETURNING id`,
      [name, template, ps, pe]
    );
    const reportId = r.rows[0].id as string;
    await client.query(
      `INSERT INTO esg.report_sections (tenant_id, report_id, code, title, status) VALUES
       (app.current_tenant(), $1, 'SUMMARY',    'Executive Summary', 'DRAFT'),
       (app.current_tenant(), $1, 'EMISSIONS',  'Emissions Overview', 'DRAFT'),
       (app.current_tenant(), $1, 'COMPLIANCE', 'BRSR Compliance', 'DRAFT')
       ON CONFLICT DO NOTHING`,
      [reportId]
    );
    return reportId;
  }

  @Mutation(() => Boolean)
  async freezeReport(@Args('reportId') reportId: string, @Context() ctx: any) {
    const client = pgClientFrom(ctx.req as Request);
    const ids = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid, current_setting('app.user_id', true) AS uid`);
    await client.query(`SELECT esg.freeze_report($1,$2,$3)`, [ids.rows[0].tid, reportId, ids.rows[0].uid]);
    return true;
  }
}


