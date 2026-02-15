import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { pgClientFrom } from '../../db/reqpg';
import { UpsertFactInput, Fact } from '../schema.gql';
import { enqueueRecalc } from '../../queue/enqueue';
import { getDefaultFactorSetId } from '../../db/factors';

@Resolver()
export class FactsResolver {
  @Query(() => [Fact])
  async listFacts(
    @Args('entityId', {nullable:true}) entityId?: string,
    @Args('metricCode', {nullable:true}) metricCode?: string,
    @Args('status', {nullable:true}) status?: string,
    @Args('periodStart', {nullable:true}) periodStart?: string,
    @Args('periodEnd', {nullable:true}) periodEnd?: string,
    @Context() ctx?: { req: Request }
  ) {
    const client = pgClientFrom(ctx?.req as Request);
    const conds: string[] = ['tenant_id = app.current_tenant()'];
    const params: any[] = [];
    let i = 0;

    if (entityId)   { conds.push(`entity_id = $${++i}`); params.push(entityId); }
    if (metricCode) { conds.push(`metric_code = $${++i}`); params.push(metricCode); }
    if (status)     { conds.push(`status = $${++i}`); params.push(status); }
    if (periodStart){ conds.push(`period_start >= $${++i}`); params.push(periodStart); }
    if (periodEnd)  { conds.push(`period_end <= $${++i}`); params.push(periodEnd); }

    const sql = `
      SELECT id, entity_id, metric_code, period_start, period_end, value, unit, status, source_type, source_ref,
             (quality_flags->>'outlier')::bool AS outlier
      FROM esg.facts
      WHERE ${conds.join(' AND ')}
      ORDER BY period_start DESC, metric_code
      LIMIT 500`;
    const res = await client.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      entityId: r.entity_id,
      metricCode: r.metric_code,
      periodStart: r.period_start.toISOString().slice(0,10),
      periodEnd: r.period_end.toISOString().slice(0,10),
      value: Number(r.value),
      unit: r.unit,
      status: r.status,
      sourceType: r.source_type ?? null,
      sourceRef: r.source_ref ?? null,
      outlier: r.outlier ?? false
    }));
  }

  @Mutation(() => String)
  async upsertFact(
    @Args('input', { type: () => UpsertFactInput }) input: UpsertFactInput,
    @Context() ctx?: { req: Request }
  ) {
    const client = pgClientFrom(ctx?.req as Request);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS t, current_setting('app.user_id', true) AS u`);
    const tenant = t.rows[0].t; const actor = t.rows[0].u;
    const sql = `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id`;
    const params = [tenant, input.entityId, input.metricCode, input.periodStart, input.periodEnd, input.value, input.unit, input.sourceType ?? null, input.sourceRef ?? null, actor];
    const r = await client.query(sql, params);
    return r.rows[0].id as string;
  }

  @Mutation(() => Boolean)
  async approveFact(@Args('id', { type: () => ID }) id: string, @Context() ctx?: { req: Request }) {
    const client = pgClientFrom(ctx?.req as Request);
    const sel = await client.query(
      `SELECT id, status, entity_id, period_start, period_end
         FROM esg.facts WHERE id = $1 AND tenant_id = app.current_tenant() FOR UPDATE`,
      [id]
    );
    if (sel.rowCount === 0) return false;
    if (sel.rows[0].status === 'APPROVED') return true;
    const upd = await client.query(
      `UPDATE esg.facts SET status='APPROVED' WHERE id=$1 AND tenant_id = app.current_tenant()`,
      [id]
    );
    if (upd.rowCount !== 1) return false;
    const fsId = await getDefaultFactorSetId(client);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    await enqueueRecalc(client, {
      tenantId: t.rows[0].tid,
      entityId: sel.rows[0].entity_id,
      periodStart: sel.rows[0].period_start.toISOString().slice(0,10),
      periodEnd: sel.rows[0].period_end.toISOString().slice(0,10),
      factorSetId: fsId
    });
    // Optional: refresh compliance findings for this period
    await client.query(`SELECT esg.evaluate_brsr(app.current_tenant(), $1, $2)`, [sel.rows[0].period_start, sel.rows[0].period_end]);
    return true;
  }
}


