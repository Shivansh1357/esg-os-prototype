import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type ExecKpi = {
  name: string;
  value: number | null;
  delta: number | null;
  status: 'GREEN' | 'YELLOW' | 'RED';
};

type ExecPayload = {
  mode: 'live' | 'snapshot';
  reportId: string;
  isLocked: boolean;
  periodStart: string;
  periodEnd: string;
  calcVersion: number;
  completenessPercent: number;
  kpis: ExecKpi[];
};

@Controller()
export class ExecController {
  @Get('/exec/summary')
  async summary(@Query('periodStart') ps: string, @Query('periodEnd') pe: string, @Req() req: Request) {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    enforceRateLimit('exec_summary', 60, 60_000);
    const client = pgClientFrom(req);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    const r = await client.query(`SELECT esg.exec_kpis($1,$2,$3) AS j`, [t.rows[0].tid, ps, pe]);
    return r.rows[0].j;
  }

  @Get('/exec/:reportId')
  async byReport(@Param('reportId') reportId: string, @Req() req: Request): Promise<ExecPayload> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    enforceRateLimit('exec_by_report', 60, 60_000);
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT esg.get_exec_kpis(app.current_tenant(), $1::uuid) AS j`,
      [reportId]
    );
    await client.query(`SELECT esg.record_pilot_event(app.current_tenant(), 'first_exec_view', 1)`);
    return r.rows[0].j as ExecPayload;
  }
}


