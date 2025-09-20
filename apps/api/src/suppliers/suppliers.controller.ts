import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { signSupplierToken } from '../public/token';

type InviteIn = { periodStart: string; periodEnd: string; suppliers: Array<{ name: string; email: string; category: string; spend: number }>; };
type InviteOut = { count: number; invites: Array<{ supplierId: string; email: string; url: string; expiresAt: string }> };

@Controller()
export class SuppliersController {
  @Post('/suppliers/invite')
  async invite(@Body() body: InviteIn, @Req() req: Request): Promise<InviteOut> {
    const client = pgClientFrom(req);
    const ttl = Number(process.env.SUPPLIER_INVITE_TTL_HOURS || '168');
    const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3001';
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
      const expires = new Date(Date.now() + ttl*3600*1000);
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
}


