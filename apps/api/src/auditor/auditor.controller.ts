import { Controller, Post, Req, Body } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { signAuditorToken } from '../public/auditorToken';

type AccessIn = { reportId: string };
type AccessOut = { url: string; expiresAt: string };

@Controller()
export class AuditorController {
  @Post('/auditor/access')
  async createAccess(@Body() body: AccessIn, @Req() req: Request): Promise<AccessOut> {
    const client = pgClientFrom(req);
    const ttl = Number(process.env.AUDITOR_TTL_HOURS || '168');
    const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3001';
    const r = await client.query(
      `SELECT id, period_start, period_end FROM esg.reports
        WHERE id=$1 AND tenant_id = app.current_tenant()`,
      [body.reportId]
    );
    if (r.rowCount === 0) throw new Error('report not found');
    const tid = (await client.query(`SELECT current_setting('app.tenant_id', true) t`)).rows[0].t;
    const token = signAuditorToken({
      tenantId: tid,
      reportId: r.rows[0].id,
      periodStart: r.rows[0].period_start.toISOString().slice(0,10),
      periodEnd: r.rows[0].period_end.toISOString().slice(0,10),
      ttlHours: ttl
    });
    const url = `${origin}/auditor/${token}`;
    const expiresAt = new Date(Date.now() + ttl*3600*1000).toISOString();
    return { url, expiresAt };
  }
}


