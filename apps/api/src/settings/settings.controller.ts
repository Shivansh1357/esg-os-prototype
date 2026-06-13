import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { pgClientFrom } from '../db/reqpg';
import { enforceRateLimit, requireRole } from '../rbac/access';

type Settings = {
  framework: string;
  fiscalYearStart: string;
  reportingCurrency: string;
  units: string;
};
type SettingsIn = Partial<Record<keyof Settings, unknown>>;

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function mapSettings(row: {
  framework: string;
  fiscal_year_start: string;
  reporting_currency: string;
  units: string;
}): Settings {
  return {
    framework: row.framework,
    fiscalYearStart: row.fiscal_year_start,
    reportingCurrency: row.reporting_currency,
    units: row.units,
  };
}

@Controller()
export class SettingsController {
  @Get('/settings')
  async get(@Req() req: Request): Promise<{ settings: Settings | null }> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT framework, fiscal_year_start, reporting_currency, units
         FROM esg.tenant_settings
        WHERE tenant_id = app.current_tenant()`,
    );
    return { settings: r.rows[0] ? mapSettings(r.rows[0]) : null };
  }

  @Put('/settings')
  async put(@Body() body: SettingsIn, @Req() req: Request): Promise<{ settings: Settings }> {
    requireRole('ADMIN');
    enforceRateLimit('settings_save', 30, 60_000);

    const framework = str(body.framework, 'BRSR');
    const fiscalYearStart = str(body.fiscalYearStart, '04-01');
    const reportingCurrency = str(body.reportingCurrency, 'INR');
    const units = str(body.units, 'metric');

    const client = pgClientFrom(req);
    const r = await client.query(
      `INSERT INTO esg.tenant_settings (tenant_id, framework, fiscal_year_start, reporting_currency, units)
       VALUES (app.current_tenant(), $1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE
         SET framework = EXCLUDED.framework,
             fiscal_year_start = EXCLUDED.fiscal_year_start,
             reporting_currency = EXCLUDED.reporting_currency,
             units = EXCLUDED.units,
             updated_at = now()
       RETURNING framework, fiscal_year_start, reporting_currency, units`,
      [framework, fiscalYearStart, reportingCurrency, units],
    );
    return { settings: mapSettings(r.rows[0]) };
  }
}
