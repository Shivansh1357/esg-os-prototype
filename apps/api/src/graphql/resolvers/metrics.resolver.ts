import { Args, Query, Resolver } from '@nestjs/graphql';
import { Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../../db/reqpg';
import { Metric } from '../schema.gql';

@Resolver()
export class MetricsResolver {
  @Query(() => [Metric])
  async listMetrics(@Args('search', { nullable: true }) search?: string, @Req() req?: Request) {
    const client = pgClientFrom(req!);
    const params: string[] = [];
    const filter = search
      ? (params.push(`%${search}%`), 'WHERE code ILIKE $1 OR name ILIKE $1')
      : '';

    const res = await client.query(
      `SELECT code, name, unit, scope
       FROM esg.metrics
       ${filter}
       ORDER BY code`,
      params
    );

    return res.rows.map(row => ({
      code: row.code,
      name: row.name,
      unit: row.unit,
      scope: Number(row.scope)
    }));
  }
}
