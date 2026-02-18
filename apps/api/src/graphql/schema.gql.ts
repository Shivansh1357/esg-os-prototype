import { Args, Context, Field, Float, ID, InputType, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { FactsResolver } from './resolvers/facts.resolver';
import { ComplianceResolver } from './resolvers/compliance.resolver';
import { ReportsResolver } from './resolvers/reports.resolver';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enqueueRecalc } from '../queue/enqueue';
import { getDefaultFactorSetId } from '../db/factors';
import { enforceRateLimit, requireRole } from '../rbac/access';
import { incMetric } from '../observability/metrics';

@ObjectType()
export class Metric { @Field() code!: string; @Field() name!: string; @Field() unit!: string; @Field() scope!: number; }
@ObjectType() export class Fact {
  @Field(() => ID) id!: string;
  @Field() entityId!: string;
  @Field() metricCode!: string;
  @Field() periodStart!: string;
  @Field() periodEnd!: string;
  @Field() value!: number;
  @Field() unit!: string;
  @Field() status!: string;
  @Field({nullable:true}) sourceType?: string;
  @Field({nullable:true}) sourceRef?: string;
  @Field({nullable:true}) outlier?: boolean;
}
@ObjectType() class EmissionTotals { @Field({nullable:true}) scope1?: number; @Field({nullable:true}) scope2_loc?: number; @Field({nullable:true}) scope2_mkt?: number; @Field({nullable:true}) scope3?: number; }
@ObjectType()
export class Finding {
  @Field(() => ID) id!: string;
  @Field() ruleCode!: string;
  @Field() status!: string;
  @Field() severity!: number;
  @Field() reason!: string;
  @Field({nullable:true}) framework?: string;
  @Field({nullable:true}) description?: string;
  @Field({nullable:true}) metricCode?: string;
  @Field() requiresEvidence!: boolean;
  @Field(() => Float) completenessWeight!: number;
  @Field({nullable:true}) evidenceUrl?: string;
  @Field({nullable:true}) owner?: string;
  @Field({nullable:true}) dueDate?: string;
}

@InputType()
export class UpsertFactInput {
  @Field() entityId!: string;
  @Field() metricCode!: string;
  @Field() periodStart!: string;
  @Field() periodEnd!: string;
  @Field() value!: number;
  @Field() unit!: string;
  @Field({nullable:true}) sourceType?: string;
  @Field({nullable:true}) sourceRef?: string;
}

@Resolver()
export class RootResolver {
  @Query(() => [Metric]) async listMetrics(@Args('search', {nullable:true}) _search?: string) {
    return [];
  }
  @Query(() => EmissionTotals, {nullable:true})
  async getTotals(
    @Args('entityId') entityId: string,
    @Args('periodStart') periodStart: string,
    @Args('periodEnd') periodEnd: string,
    @Context() ctx?: { req: Request; res?: any }
  ) {
    const req = ctx?.req as Request | undefined;
    if (!req) return null;
    const client = pgClientFrom(req);
    const fsId = await getDefaultFactorSetId(client);
    const r = await client.query(
      `SELECT scope1, scope2_loc, scope2_mkt, scope3
         FROM esg.emission_totals
        WHERE tenant_id = app.current_tenant()
          AND entity_id = $1 AND period_start = $2 AND period_end = $3 AND factor_set_id = $4`,
      [entityId, periodStart, periodEnd, fsId]
    );
    if (r.rowCount === 0) return null;
    return { scope1: r.rows[0].scope1 ?? null, scope2_loc: r.rows[0].scope2_loc ?? null, scope2_mkt: r.rows[0].scope2_mkt ?? null, scope3: r.rows[0].scope3 ?? null };
  }
  // gapMap implemented in ComplianceResolver
  @Mutation(() => Boolean)
  async setDefaultFactorSet(@Args('id') factorSetId: string, @Context() ctx?: { req: Request; res?: any }) {
    requireRole('ADMIN');
    const req = ctx?.req as Request | undefined;
    if (!req) return false;
    const client = pgClientFrom(req);
    await client.query(
      `INSERT INTO esg.tenant_defaults (tenant_id, factor_set_id)
       VALUES (app.current_tenant(), $1)
       ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
      [factorSetId]
    );
    return true;
  }
  @Mutation(() => Boolean)
  async recalc(
    @Args('entityId') entityId: string,
    @Args('periodStart') periodStart: string,
    @Args('periodEnd') periodEnd: string,
    @Args('factorSetId') factorSetId: string,
    @Context() ctx?: { req: Request; res?: any }
  ) {
    requireRole('ADMIN');
    enforceRateLimit('recalc', 30, 60_000);
    const req = ctx?.req as Request | undefined;
    if (!req) return false;
    const client = pgClientFrom(req);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    await enqueueRecalc(client, {
      tenantId: t.rows[0].tid,
      entityId,
      periodStart,
      periodEnd,
      factorSetId
    });
    incMetric('recalc_total');
    return true;
  }
  // resolveGap implemented in ComplianceResolver
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req, res }: { req: any; res: any }) => ({ req, res })
    })
  ],
  providers: [RootResolver, FactsResolver, ComplianceResolver, ReportsResolver]
})
export class GraphModule {}


