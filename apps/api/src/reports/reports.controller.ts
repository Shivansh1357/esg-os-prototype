import { Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import { pgClientFrom } from '../db/reqpg';
import { currentRole, requireRole } from '../rbac/access';

const s3 = new S3Client({
  region: 'us-east-1',
  forcePathStyle: true,
  endpoint: process.env.S3_ENDPOINT,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }
});

type ExportResponse = { url: string; mode: 'live' | 'snapshot' };
type ReportMetaResponse = {
  id: string;
  name: string;
  template: string;
  periodStart: string;
  periodEnd: string;
  isLocked: boolean;
  factorSetId: string | null;
  factorSetCode: string | null;
  factorSetVersion: string | null;
  calcVersion: number | null;
  completenessPercent: number | null;
  frozenAt: string | null;
  complianceSnapshot: unknown[] | null;
};
type ReportListItem = {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  isLocked: boolean;
  calcVersion: number | null;
  updatedAt: string;
};

@Controller()
export class ReportsController {
  @Get('/reports')
  async listReports(@Req() req: Request): Promise<ReportListItem[]> {
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT r.id, r.name, r.period_start, r.period_end,
              COALESCE(r.is_locked, r.locked, false) AS is_locked,
              r.calc_version, r.updated_at
         FROM esg.reports r
        WHERE r.tenant_id = app.current_tenant()
        ORDER BY r.period_start DESC, COALESCE(r.is_locked, r.locked, false) DESC, r.updated_at DESC`
    );
    return r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      periodStart: iso(row.period_start),
      periodEnd: iso(row.period_end),
      isLocked: !!row.is_locked,
      calcVersion: row.calc_version ?? null,
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  @Get('/reports/by-period')
  async getReportByPeriod(
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @Req() req: Request
  ): Promise<ReportMetaResponse | null> {
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT r.id
         FROM esg.reports r
        WHERE r.tenant_id = app.current_tenant()
          AND r.period_start = $1
          AND r.period_end = $2
        ORDER BY COALESCE(r.is_locked, r.locked, false) DESC, r.updated_at DESC
        LIMIT 1`,
      [periodStart, periodEnd]
    );
    if (r.rowCount === 0) return null;
    return this.getReport(r.rows[0].id, req);
  }

  @Get('/reports/:id')
  async getReport(@Param('id') id: string, @Req() req: Request): Promise<ReportMetaResponse> {
    const client = pgClientFrom(req);
    const r = await client.query(
      `SELECT r.id, r.name, r.template, r.period_start, r.period_end,
              COALESCE(r.is_locked, r.locked, false) AS is_locked,
              r.factor_set_id, fs.code AS factor_set_code, fs.version AS factor_set_version,
              r.calc_version, r.completeness_percent, r.frozen_at, r.compliance_snapshot
         FROM esg.reports r
         LEFT JOIN esg.factor_sets fs ON fs.id = r.factor_set_id
        WHERE r.id=$1 AND r.tenant_id = app.current_tenant()`,
      [id]
    );
    if (r.rowCount === 0) throw new Error('report not found');
    const row = r.rows[0];
    return {
      id: row.id,
      name: row.name,
      template: row.template,
      periodStart: iso(row.period_start),
      periodEnd: iso(row.period_end),
      isLocked: !!row.is_locked,
      factorSetId: row.factor_set_id ?? null,
      factorSetCode: row.factor_set_code ?? null,
      factorSetVersion: row.factor_set_version ?? null,
      calcVersion: row.calc_version ?? null,
      completenessPercent: row.completeness_percent ?? null,
      frozenAt: row.frozen_at ? new Date(row.frozen_at).toISOString() : null,
      complianceSnapshot: row.compliance_snapshot ?? null
    };
  }

  @Post('/reports/:id/export')
  async export(@Param('id') id: string, @Query('format') format: 'pdf'|'xlsx'|'json', @Req() req: Request): Promise<ExportResponse> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    if (!['pdf','xlsx','json'].includes(format)) { throw new Error('format must be pdf|xlsx|json'); }
    const client = pgClientFrom(req);

    const lockKey1 = 42;
    const lockKey2 = Math.abs(crypto.createHash('sha1').update(id).digest().readInt32BE(0));
    await client.query(`SELECT pg_advisory_lock($1,$2)`, [lockKey1, lockKey2]);

    try {
      const payloadResult = await client.query(
        `SELECT esg.get_report_export_payload(app.current_tenant(), $1) AS payload`,
        [id]
      );
      const payload = payloadResult.rows[0]?.payload;
      if (!payload) throw new Error('report not found');
      if (currentRole() === 'AUDITOR' && payload.mode !== 'snapshot') {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }
      const rpt = payload.report;

      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const key = `reports/${id}/${ts}.${format}`;
      const bucket = process.env.S3_BUCKET || 'mock-bucket';
      const hasS3 =
        !!process.env.S3_BUCKET &&
        !!process.env.S3_ENDPOINT &&
        !!process.env.S3_ACCESS_KEY &&
        !!process.env.S3_SECRET_KEY;

      let body: Buffer;
      if (format === 'xlsx') {
        body = await buildWorkbookBuffer({
          reportName: rpt.name,
          template: rpt.template,
          periodStart: rpt.periodStart,
          periodEnd: rpt.periodEnd,
          totals: payload.totals,
          compliance: payload.compliance,
          factor: payload.factorSet,
          calcVersion: payload.calcVersion,
          completenessPercent: payload.completenessPercent,
          footnote: payload.footnote
        });
      } else if (format === 'pdf') {
        body = await buildPdfBuffer({
          reportName: rpt.name,
          template: rpt.template,
          periodStart: rpt.periodStart,
          periodEnd: rpt.periodEnd,
          totals: payload.totals,
          compliance: payload.compliance,
          factor: payload.factorSet,
          outlierCount: Number(payload.outlierCount ?? 0),
          calcVersion: payload.calcVersion,
          completenessPercent: payload.completenessPercent,
          footnote: payload.footnote
        });
      } else {
        body = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
      }

      let getUrl = `mock://reports/${id}/${ts}.${format}`;
      if (hasS3) {
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: format === 'pdf' ? 'application/pdf' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json',
        }));
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
      }

      await client.query(
        `INSERT INTO esg.report_artifacts (tenant_id, report_id, format, s3_key, bytes)
         VALUES (app.current_tenant(), $1, $2, $3, $4)`,
        [id, format === 'json' ? 'xlsx' : format, `s3://${bucket}/${key}`, body.length]
      );

      return { url: getUrl, mode: payload.mode === 'snapshot' ? 'snapshot' : 'live' };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1,$2)`, [lockKey1, lockKey2]);
    }
  }
}

function footnotesText(args: { template: string; factor?: any; periodStart: string | Date; periodEnd: string | Date; outlierCount?: number; }) {
  const { template, factor, periodStart, periodEnd, outlierCount } = args;
  const fs = factor ? `${factor.code} v${factor.version}` : 'N/A';
  return `Generated from frozen snapshot. Template: ${template}. Factor set: ${fs}. Period: ${iso(periodStart)}..${iso(periodEnd)}. Data-quality flags (outliers): ${outlierCount ?? 0}`;
}

function iso(d: string | Date){ return (d instanceof Date ? d : new Date(d)).toISOString().slice(0,10); }

async function buildWorkbookBuffer(args: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet('Summary');
  info.addRow([args.reportName]);
  info.addRow([`Period`, iso(args.periodStart), 'to', iso(args.periodEnd)]);
  info.addRow([`Template`, args.template]);
  info.addRow([]);
  info.addRow(['Emissions (kgCO2e)']);
  info.addRow(['Scope 1', Number(args.totals.s1 || 0)]);
  info.addRow(['Scope 2 (loc)', Number(args.totals.s2l || 0)]);
  info.addRow(['Scope 2 (mkt)', Number(args.totals.s2m || 0)]);
  info.addRow(['Scope 3', Number(args.totals.s3 || 0)]);
  info.addRow([]);
  info.addRow(['Compliance']);
  info.addRow(['PASS', Number(args.compliance.pass || 0)]);
  info.addRow(['FAIL', Number(args.compliance.fail || 0)]);
  info.addRow(['RISK', Number(args.compliance.risk || 0)]);
  const notes = wb.addWorksheet('Footnotes');
  notes.addRow([args.footnote || footnotesText({ template: args.template, factor: args.factor, periodStart: args.periodStart, periodEnd: args.periodEnd, outlierCount: undefined })]);
  const b = await wb.xlsx.writeBuffer();
  return Buffer.from(b as ArrayBuffer);
}

async function buildPdfBuffer(args: any): Promise<Buffer> {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(args.reportName)} - ${escapeHtml(args.template)}</title><style>body{font-family:Arial,sans-serif;margin:32px}h1{margin:0 0 8px}h2{margin-top:24px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ddd;padding:8px;text-align:left}.foot{margin-top:24px;font-size:12px;color:#666}</style></head><body><h1>${escapeHtml(args.reportName)}</h1><div>Template: <b>${escapeHtml(args.template)}</b></div><div>Period: <b>${iso(args.periodStart)}</b> to <b>${iso(args.periodEnd)}</b></div><h2>Emissions (kgCO2e)</h2><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Scope 1</td><td>${Number(args.totals.s1 || 0).toLocaleString()}</td></tr><tr><td>Scope 2 (location)</td><td>${Number(args.totals.s2l || 0).toLocaleString()}</td></tr><tr><td>Scope 2 (market)</td><td>${Number(args.totals.s2m || 0).toLocaleString()}</td></tr><tr><td>Scope 3</td><td>${Number(args.totals.s3 || 0).toLocaleString()}</td></tr></table><h2>BRSR Compliance</h2><table><tr><th>Status</th><th>Count</th></tr><tr><td>PASS</td><td>${Number(args.compliance.pass || 0)}</td></tr><tr><td>FAIL</td><td>${Number(args.compliance.fail || 0)}</td></tr><tr><td>RISK</td><td>${Number(args.compliance.risk || 0)}</td></tr></table><div class="foot">${escapeHtml(args.footnote || footnotesText({ template: args.template, factor: args.factor, periodStart: args.periodStart, periodEnd: args.periodEnd, outlierCount: args.outlierCount }))}</div></body></html>`;
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } });
  await browser.close();
  return Buffer.from(pdf);
}

function escapeHtml(s: string){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]!)); }
