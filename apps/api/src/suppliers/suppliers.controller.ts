import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { signSupplierToken } from '../public/token';
import { getDefaultFactorSetId } from '../db/factors';
import { enforceRateLimit, requireRole } from '../rbac/access';
import { incMetric } from '../observability/metrics';

type InviteIn = { periodStart: string; periodEnd: string; suppliers: Array<{ name: string; email: string; category: string; spend: number }>; };
type InviteOut = { count: number; invites: Array<{ supplierId: string; email: string; url: string; expiresAt: string }> };
type SupplierResponseItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  category: string;
  periodStart: string;
  periodEnd: string;
  emissionsKgCO2e: number | null;
  approved: boolean;
  dataQualityTier: 'PRIMARY' | 'SECONDARY' | 'ESTIMATED';
  submittedAt: string;
};

@Controller()
export class SuppliersController {
  @Post('/suppliers/invite')
  async invite(@Body() body: InviteIn, @Req() req: Request): Promise<InviteOut> {
    requireRole('ADMIN', 'MEMBER');
    const client = pgClientFrom(req);
    const ttl = Number(process.env.SUPPLIER_INVITE_TTL_HOURS || '168');
    const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:5051';
    const created: InviteOut = { count: 0, invites: [] };
    for (const s of body.suppliers) {
      const up = await client.query(
        `INSERT INTO esg.suppliers(tenant_id,name,email,category,spend)
         VALUES (app.current_tenant(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id, email) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, spend=EXCLUDED.spend, updated_at=now()
         RETURNING id, email`,
        [s.name, s.email, s.category, s.spend]
      );
      const supplierId = up.rows[0].id as string;
      const expires = new Date(Date.now() + ttl * 3600 * 1000);
      await client.query(
        `INSERT INTO esg.supplier_invites(tenant_id, supplier_id, period_start, period_end, invited_email, expires_at)
         VALUES (app.current_tenant(), $1, $2, $3, $4, $5)`,
        [supplierId, body.periodStart, body.periodEnd, s.email, expires]
      );
      const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS t`);
      const token = signSupplierToken({ tenantId: t.rows[0].t, supplierId, periodStart: body.periodStart, periodEnd: body.periodEnd, ttlHours: ttl });
      const url = `${origin}/s/${token}`;
      created.invites.push({ supplierId, email: s.email, url, expiresAt: expires.toISOString() });
      created.count++;
    }
    if (created.count > 0) {
      await client.query(`SELECT esg.record_pilot_event(app.current_tenant(), 'supplier_invite', $1)`, [created.count]);
    }
    return created;
  }

  @Get('/suppliers/coverage')
  async coverage(@Query('periodStart') ps: string, @Query('periodEnd') pe: string, @Req() req: Request) {
    const client = pgClientFrom(req);
    const tid = (await client.query(`SELECT current_setting('app.tenant_id', true) AS t`)).rows[0].t;
    const cov = await client.query(`SELECT esg.suppliers_coverage($1,$2,$3) AS c`, [tid, ps, pe]);
    const byCat = await client.query(`SELECT * FROM esg.suppliers_category_rollup($1,$2,$3)`, [tid, ps, pe]);
    return { ...cov.rows[0].c, byCategory: byCat.rows };
  }

  @Get('/suppliers/responses')
  async responses(
    @Query('periodStart') ps: string,
    @Query('periodEnd') pe: string,
    @Req() req: Request
  ): Promise<SupplierResponseItem[]> {
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT sr.id,
              sr.supplier_id,
              s.name AS supplier_name,
              s.email AS supplier_email,
              COALESCE(sr.category, s.category) AS category,
              sr.period_start,
              sr.period_end,
              sr.emissions_kgco2e,
              sr.approved,
              sr.data_quality_tier,
              sr.submitted_at
         FROM esg.supplier_responses sr
         JOIN esg.suppliers s
           ON s.id = sr.supplier_id
          AND s.tenant_id = sr.tenant_id
        WHERE sr.tenant_id = app.current_tenant()
          AND sr.period_start = $1
          AND sr.period_end = $2
        ORDER BY sr.submitted_at DESC`,
      [ps, pe]
    );
    return r.rows.map((x) => ({
      id: x.id,
      supplierId: x.supplier_id,
      supplierName: x.supplier_name,
      supplierEmail: x.supplier_email,
      category: x.category,
      periodStart: x.period_start.toISOString().slice(0, 10),
      periodEnd: x.period_end.toISOString().slice(0, 10),
      emissionsKgCO2e: x.emissions_kgco2e == null ? null : Number(x.emissions_kgco2e),
      approved: !!x.approved,
      dataQualityTier: x.data_quality_tier,
      submittedAt: new Date(x.submitted_at).toISOString()
    }));
  }

  @Post('/suppliers/responses/approve')
  async approveResponse(
    @Body() body: { responseId: string },
    @Req() req: Request
  ): Promise<{ ok: boolean }> {
    requireRole('ADMIN');
    enforceRateLimit('approve_supplier_response', 30, 60_000);
    const client = pgClientFrom(req);
    const locked = await client.query(
      `SELECT id,
              to_char(period_start, 'YYYY-MM-DD') AS period_start,
              to_char(period_end, 'YYYY-MM-DD') AS period_end
         FROM esg.supplier_responses
        WHERE id = $1
          AND tenant_id = app.current_tenant()
        FOR UPDATE`,
      [body.responseId]
    );
    if (locked.rowCount === 0) return { ok: false };

    await client.query(
      `UPDATE esg.supplier_responses
          SET approved = true
        WHERE id = $1
          AND tenant_id = app.current_tenant()`,
      [body.responseId]
    );

    const org = await client.query(
      `SELECT id
         FROM esg.entities
        WHERE tenant_id = app.current_tenant()
          AND etype = 'ORG'
          AND parent_id IS NULL
        ORDER BY created_at
        LIMIT 1`
    );
    if ((org.rowCount ?? 0) > 0) {
      const fsId = await getDefaultFactorSetId(client);
      const tid = (await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`)).rows[0].tid;
      const entityId = org.rows[0].id as string;
      const periodStart = locked.rows[0].period_start as string;
      const periodEnd = locked.rows[0].period_end as string;
      await client.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [tid, entityId, periodStart, periodEnd, fsId]);
      incMetric('recalc_total');
    }

    await client.query(`SELECT esg.refresh_exec_kpi_base()`);

    return { ok: true };
  }
}


