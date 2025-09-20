import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';

@Controller()
export class ExecController {
  @Get('/exec/summary')
  async summary(@Query('periodStart') ps: string, @Query('periodEnd') pe: string, @Req() req: Request) {
    const client = pgClientFrom(req);
    const t = await client.query(`SELECT current_setting('app.tenant_id', true) AS tid`);
    const r = await client.query(`SELECT esg.exec_kpis($1,$2,$3) AS j`, [t.rows[0].tid, ps, pe]);
    return r.rows[0].j;
  }
}


