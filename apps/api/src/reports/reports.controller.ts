import { Controller, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import { pgClientFrom } from '../db/reqpg';

const s3 = new S3Client({
  region: 'us-east-1',
  forcePathStyle: true,
  endpoint: process.env.S3_ENDPOINT,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }
});

type ExportResponse = { url: string };

@Controller()
export class ReportsController {
  @Post('/reports/:id/export')
  async export(@Param('id') id: string, @Query('format') format: 'pdf'|'xlsx', @Req() req: Request): Promise<ExportResponse> {
    if (!['pdf','xlsx'].includes(format)) { throw new Error('format must be pdf|xlsx'); }
    const client = pgClientFrom(req);

    const lockKey1 = 42;
    const lockKey2 = Math.abs(crypto.createHash('sha1').update(id).digest().readInt32BE(0));
    await client.query(`SELECT pg_advisory_lock($1,$2)`, [lockKey1, lockKey2]);

    try {
      const r = await client.query(
        `SELECT id, tenant_id, name, template, period_start, period_end
           FROM esg.reports WHERE id=$1 AND tenant_id = app.current_tenant()`,
        [id]
      );
      if (r.rowCount === 0) throw new Error('report not found');
      const rpt = r.rows[0];

      await client.query(`SELECT esg.evaluate_brsr(app.current_tenant(), $1, $2)`, [rpt.period_start, rpt.period_end]);

      const fs = await client.query(
        `SELECT td.factor_set_id AS id, fs.code, fs.name, fs.version
           FROM esg.tenant_defaults td
           JOIN esg.factor_sets fs ON fs.id=td.factor_set_id
          WHERE td.tenant_id = app.current_tenant()`
      );
      const factor = fs.rows[0];

      const totals = await client.query(
        `SELECT COALESCE(SUM(scope1),0) s1, COALESCE(SUM(scope2_loc),0) s2l, COALESCE(SUM(scope2_mkt),0) s2m, COALESCE(SUM(scope3),0) s3
         FROM esg.emission_totals
        WHERE tenant_id = app.current_tenant() AND period_start=$1 AND period_end=$2 AND factor_set_id=$3`,
        [rpt.period_start, rpt.period_end, factor?.id]
      );

      const outliers = await client.query(
        `SELECT count(*)::int AS n
           FROM esg.facts
          WHERE tenant_id=app.current_tenant()
            AND period_start=$1 AND period_end=$2
            AND (quality_flags->>'outlier')::bool IS TRUE`,
        [rpt.period_start, rpt.period_end]
      );

      const comp = await client.query(
        `SELECT SUM((status='PASS')::int) pass, SUM((status='FAIL')::int) fail, SUM((status='RISK')::int) risk, COUNT(*) total
         FROM esg.compliance_findings
        WHERE tenant_id=app.current_tenant() AND period_start=$1 AND period_end=$2`,
        [rpt.period_start, rpt.period_end]
      );

      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const key = `reports/${id}/${ts}.${format}`;
      const bucket = process.env.S3_BUCKET!;

      let body: Buffer;
      if (format === 'xlsx') {
        body = await buildWorkbookBuffer({
          reportName: rpt.name,
          template: rpt.template,
          periodStart: rpt.period_start,
          periodEnd: rpt.period_end,
          totals: totals.rows[0],
          compliance: comp.rows[0],
          factor
        });
      } else {
        body = await buildPdfBuffer({
          reportName: rpt.name,
          template: rpt.template,
          periodStart: rpt.period_start,
          periodEnd: rpt.period_end,
          totals: totals.rows[0],
          compliance: comp.rows[0],
          factor,
          outlierCount: outliers.rows[0].n
        });
      }

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));

      await client.query(
        `INSERT INTO esg.report_artifacts (tenant_id, report_id, format, s3_key, bytes)
         VALUES (app.current_tenant(), $1, $2, $3, $4)`,
        [id, format, `s3://${bucket}/${key}`, body.length]
      );

      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });

      return { url: getUrl };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1,$2)`, [lockKey1, lockKey2]);
    }
  }
}

function footnotesText(args: { template: string; factor?: any; periodStart: string | Date; periodEnd: string | Date; outlierCount?: number; }) {
  const { template, factor, periodStart, periodEnd, outlierCount } = args;
  const fs = factor ? `${factor.code} v${factor.version}` : 'N/A';
  return `Template: ${template} • Factor set: ${fs} • Period: ${iso(periodStart)}..${iso(periodEnd)} • Data-quality flags (outliers): ${outlierCount ?? 0}`;
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
  notes.addRow([footnotesText({ template: args.template, factor: args.factor, periodStart: args.periodStart, periodEnd: args.periodEnd, outlierCount: undefined })]);
  const b = await wb.xlsx.writeBuffer();
  return Buffer.from(b as ArrayBuffer);
}

async function buildPdfBuffer(args: any): Promise<Buffer> {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(args.reportName)} – ${escapeHtml(args.template)}</title><style>body{font-family:Arial,sans-serif;margin:32px}h1{margin:0 0 8px}h2{margin-top:24px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ddd;padding:8px;text-align:left}.foot{margin-top:24px;font-size:12px;color:#666}</style></head><body><h1>${escapeHtml(args.reportName)}</h1><div>Template: <b>${escapeHtml(args.template)}</b></div><div>Period: <b>${iso(args.periodStart)}</b> to <b>${iso(args.periodEnd)}</b></div><h2>Emissions (kgCO2e)</h2><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Scope 1</td><td>${Number(args.totals.s1 || 0).toLocaleString()}</td></tr><tr><td>Scope 2 (location)</td><td>${Number(args.totals.s2l || 0).toLocaleString()}</td></tr><tr><td>Scope 2 (market)</td><td>${Number(args.totals.s2m || 0).toLocaleString()}</td></tr><tr><td>Scope 3</td><td>${Number(args.totals.s3 || 0).toLocaleString()}</td></tr></table><h2>BRSR Compliance</h2><table><tr><th>Status</th><th>Count</th></tr><tr><td>PASS</td><td>${Number(args.compliance.pass || 0)}</td></tr><tr><td>FAIL</td><td>${Number(args.compliance.fail || 0)}</td></tr><tr><td>RISK</td><td>${Number(args.compliance.risk || 0)}</td></tr></table><div class="foot">${escapeHtml(footnotesText({ template: args.template, factor: args.factor, periodStart: args.periodStart, periodEnd: args.periodEnd, outlierCount: args.outlierCount }))}</div></body></html>`;
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } });
  await browser.close();
  return Buffer.from(pdf);
}

function escapeHtml(s: string){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]!)); }


