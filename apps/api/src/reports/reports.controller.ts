import { Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import * as archiver from 'archiver';
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

  @Post('/reports/:id/audit-pack')
  async auditPack(@Param('id') id: string, @Req() req: Request): Promise<ExportResponse> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    const client = pgClientFrom(req);

    const lockKey1 = 43;
    const lockKey2 = Math.abs(crypto.createHash('sha1').update(id).digest().readInt32BE(0));
    await client.query(`SELECT pg_advisory_lock($1,$2)`, [lockKey1, lockKey2]);

    try {
      const payloadResult = await client.query(
        `SELECT esg.get_report_export_payload(app.current_tenant(), $1) AS payload`, [id]
      );
      const payload = payloadResult.rows[0]?.payload;
      if (!payload) throw new Error('report not found');
      if (currentRole() === 'AUDITOR' && payload.mode !== 'snapshot') {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      // Fetch audit events for the period
      const eventsResult = await client.query(
        `SELECT action, entity_type, entity_id, payload AS data, created_at
           FROM esg.facts_audit
          WHERE tenant_id = app.current_tenant()
            AND created_at >= $1::date AND created_at <= ($2::date + interval '1 day')
          ORDER BY created_at DESC LIMIT 500`,
        [payload.report.periodStart, payload.report.periodEnd]
      );

      const rpt = payload.report;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const key = `audit-packs/${id}/${ts}.zip`;
      const bucket = process.env.S3_BUCKET || 'mock-bucket';
      const hasS3 = !!process.env.S3_BUCKET && !!process.env.S3_ENDPOINT && !!process.env.S3_ACCESS_KEY && !!process.env.S3_SECRET_KEY;

      // Build ZIP with archiver
      const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const archive = (archiver as any).default ? (archiver as any).default('zip', { zlib: { level: 9 } }) : (archiver as any)('zip', { zlib: { level: 9 } });
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);

        // 1. Report summary (JSON)
        archive.append(JSON.stringify({
          report: rpt,
          factorSet: payload.factorSet,
          calcVersion: payload.calcVersion,
          completenessPercent: payload.completenessPercent,
          totals: payload.totals,
          compliance: payload.compliance,
          mode: payload.mode,
          generatedAt: new Date().toISOString(),
        }, null, 2), { name: 'report-summary.json' });

        // 2. Compliance findings
        archive.append(JSON.stringify(payload.complianceFindings ?? [], null, 2), { name: 'compliance-findings.json' });

        // 3. Audit trail events
        archive.append(JSON.stringify(eventsResult.rows ?? [], null, 2), { name: 'audit-trail.json' });

        // 4. Full export payload (for machine consumption)
        archive.append(JSON.stringify(payload, null, 2), { name: 'full-payload.json' });

        // 5. Assurance cover sheet (text)
        const cover = [
          `AUDIT PACK — ${rpt.name}`,
          `Template: ${rpt.template}`,
          `Period: ${rpt.periodStart} to ${rpt.periodEnd}`,
          `Frozen: ${rpt.isLocked ? 'YES' : 'NO'}${rpt.frozenAt ? ` (${rpt.frozenAt})` : ''}`,
          `Factor Set: ${payload.factorSet?.code ?? 'N/A'} v${payload.factorSet?.version ?? 'N/A'}`,
          `Calc Version: ${payload.calcVersion ?? 'N/A'}`,
          `Completeness: ${payload.completenessPercent ?? 0}%`,
          ``,
          `Emissions (kgCO2e):`,
          `  Scope 1: ${payload.totals?.s1 ?? 0}`,
          `  Scope 2 (location): ${payload.totals?.s2l ?? 0}`,
          `  Scope 2 (market): ${payload.totals?.s2m ?? 0}`,
          `  Scope 3: ${payload.totals?.s3 ?? 0}`,
          ``,
          `Compliance: ${payload.compliance?.pass ?? 0} PASS / ${payload.compliance?.fail ?? 0} FAIL / ${payload.compliance?.risk ?? 0} RISK`,
          `Audit Events: ${eventsResult.rows.length}`,
          ``,
          `Generated: ${new Date().toISOString()}`,
          `Mode: ${payload.mode}`,
        ].join('\n');
        archive.append(cover, { name: 'COVER.txt' });

        archive.finalize();
      });

      let getUrl = `mock://audit-packs/${id}/${ts}.zip`;
      if (hasS3) {
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: zipBuffer, ContentType: 'application/zip',
        }));
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
      }

      await client.query(
        `INSERT INTO esg.report_artifacts (tenant_id, report_id, format, s3_key, bytes)
         VALUES (app.current_tenant(), $1, 'zip', $2, $3)`,
        [id, `s3://${bucket}/${key}`, zipBuffer.length]
      );

      return { url: getUrl, mode: payload.mode === 'snapshot' ? 'snapshot' : 'live' };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1,$2)`, [lockKey1, lockKey2]);
    }
  }

  @Post('/reports/:id/export')
  async export(@Param('id') id: string, @Query('format') format: 'pdf'|'xlsx'|'json'|'brsr', @Req() req: Request): Promise<ExportResponse> {
    requireRole('ADMIN', 'MEMBER', 'AUDITOR');
    if (!['pdf','xlsx','json','brsr'].includes(format)) { throw new Error('format must be pdf|xlsx|json|brsr'); }
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
      const ext = format === 'brsr' ? 'xlsx' : format;
      const key = `reports/${id}/${ts}.${ext}`;
      const bucket = process.env.S3_BUCKET || 'mock-bucket';
      const hasS3 =
        !!process.env.S3_BUCKET &&
        !!process.env.S3_ENDPOINT &&
        !!process.env.S3_ACCESS_KEY &&
        !!process.env.S3_SECRET_KEY;

      let body: Buffer;
      if (format === 'brsr') {
        // Fetch detailed compliance findings for BRSR report
        const findingsResult = await client.query(
          `SELECT r.code, r.title, r.principle, r.brsr_section, r.description, r.category,
                  r.requires_evidence, r.metric_code,
                  f.status::text AS status, f.reason, f.evidence_url, f.severity
             FROM esg.compliance_findings f
             JOIN esg.compliance_rules r ON r.id = f.rule_id
            WHERE f.tenant_id = app.current_tenant()
              AND f.period_start = $1 AND f.period_end = $2
              AND r.framework = 'BRSR_CORE'
            ORDER BY r.principle, r.code`,
          [rpt.periodStart, rpt.periodEnd]
        );
        body = await buildBrsrWorkbookBuffer({
          reportName: rpt.name,
          template: rpt.template,
          periodStart: rpt.periodStart,
          periodEnd: rpt.periodEnd,
          totals: payload.totals,
          compliance: payload.compliance,
          factor: payload.factorSet,
          calcVersion: payload.calcVersion,
          completenessPercent: payload.completenessPercent,
          findings: findingsResult.rows,
        });
      } else if (format === 'xlsx') {
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
          ContentType: format === 'pdf' ? 'application/pdf' : (format === 'xlsx' || format === 'brsr') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json',
        }));
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
      }

      await client.query(
        `INSERT INTO esg.report_artifacts (tenant_id, report_id, format, s3_key, bytes)
         VALUES (app.current_tenant(), $1, $2, $3, $4)`,
        [id, format === 'json' ? 'json' : format === 'brsr' ? 'xlsx' : format, `s3://${bucket}/${key}`, body.length]
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

const PRINCIPLE_LABELS: Record<string, string> = {
  P1: 'Principle 1 — Ethics, Transparency & Accountability',
  P2: 'Principle 2 — Sustainable & Safe Products/Services',
  P3: 'Principle 3 — Employee Well-being',
  P4: 'Principle 4 — Stakeholder Engagement',
  P5: 'Principle 5 — Human Rights',
  P6: 'Principle 6 — Environmental Protection',
  P7: 'Principle 7 — Responsible Policy Advocacy',
  P8: 'Principle 8 — Inclusive Growth',
  P9: 'Principle 9 — Consumer Responsibility',
};

async function buildBrsrWorkbookBuffer(args: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: Cover
  const cover = wb.addWorksheet('BRSR Cover');
  cover.columns = [{ width: 30 }, { width: 50 }];
  cover.addRow(['BRSR Report', args.reportName]).font = { bold: true, size: 14 };
  cover.addRow([]);
  cover.addRow(['Template', args.template]);
  cover.addRow(['Period', `${iso(args.periodStart)} to ${iso(args.periodEnd)}`]);
  cover.addRow(['Factor Set', args.factor ? `${args.factor.code} v${args.factor.version}` : 'N/A']);
  cover.addRow(['Calc Version', args.calcVersion ?? 'N/A']);
  cover.addRow(['Completeness', `${args.completenessPercent ?? 0}%`]);
  cover.addRow([]);
  cover.addRow(['Section A: General Disclosures']).font = { bold: true };
  cover.addRow(['Report generated per SEBI BRSR format']);
  cover.addRow(['Framework: BRSR_CORE (NGRBC Principles P1-P9)']);

  // Sheet 2: Emissions Summary (Section A.III)
  const emissions = wb.addWorksheet('Section A.III - Emissions');
  emissions.columns = [{ width: 35 }, { width: 20 }, { width: 15 }];
  emissions.addRow(['GHG Emissions Summary', '', '']).font = { bold: true };
  emissions.addRow(['Metric', 'Value (kgCO2e)', 'Notes']);
  emissions.addRow(['Scope 1 (Direct)', Number(args.totals?.s1 || 0), 'Fuel combustion, process emissions']);
  emissions.addRow(['Scope 2 (Location-based)', Number(args.totals?.s2l || 0), 'Purchased electricity (grid average)']);
  emissions.addRow(['Scope 2 (Market-based)', Number(args.totals?.s2m || 0), 'Purchased electricity (contractual)']);
  emissions.addRow(['Scope 3 (Value Chain)', Number(args.totals?.s3 || 0), 'Upstream + downstream indirect']);
  emissions.addRow([]);
  emissions.addRow(['Total Scope 1+2 (location)', Number((args.totals?.s1 || 0) + (args.totals?.s2l || 0)), '']);

  // Sheet 3: Compliance by Principle (Section B)
  const compliance = wb.addWorksheet('Section B - Principles');
  compliance.columns = [{ width: 8 }, { width: 40 }, { width: 15 }, { width: 12 }, { width: 10 }, { width: 50 }, { width: 30 }];
  compliance.addRow(['NGRBC Principle Compliance Status', '', '', '', '', '', '']).font = { bold: true };
  compliance.addRow(['Principle', 'Rule Title', 'Section', 'Category', 'Status', 'Reason', 'Evidence']);

  const findings = args.findings ?? [];
  let currentPrinciple = '';

  for (const f of findings) {
    if (f.principle !== currentPrinciple) {
      currentPrinciple = f.principle;
      compliance.addRow([]);
      const pRow = compliance.addRow([PRINCIPLE_LABELS[currentPrinciple] || currentPrinciple, '', '', '', '', '', '']);
      pRow.font = { bold: true };
    }
    compliance.addRow([
      f.principle || '—',
      f.title || f.code,
      f.brsr_section || '—',
      f.category || '—',
      f.status,
      f.reason || '—',
      f.evidence_url || '—',
    ]);
  }

  // Sheet 4: Compliance Summary
  const summary = wb.addWorksheet('Compliance Summary');
  summary.columns = [{ width: 20 }, { width: 15 }];
  summary.addRow(['Compliance Overview', '']).font = { bold: true };
  summary.addRow(['Status', 'Count']);
  summary.addRow(['PASS', Number(args.compliance?.pass || 0)]);
  summary.addRow(['FAIL', Number(args.compliance?.fail || 0)]);
  summary.addRow(['RISK', Number(args.compliance?.risk || 0)]);
  summary.addRow(['Total', Number(args.compliance?.total || 0)]);
  summary.addRow([]);

  // Principle-level summary
  const principleGroups: Record<string, { pass: number; total: number }> = {};
  for (const f of findings) {
    const p = f.principle || 'Other';
    if (!principleGroups[p]) principleGroups[p] = { pass: 0, total: 0 };
    principleGroups[p].total++;
    if (f.status === 'PASS') principleGroups[p].pass++;
  }
  summary.addRow(['Principle-wise Completeness', '']).font = { bold: true };
  summary.addRow(['Principle', 'Completeness']);
  for (const [p, s] of Object.entries(principleGroups).sort(([a],[b]) => a.localeCompare(b))) {
    summary.addRow([PRINCIPLE_LABELS[p] || p, `${s.pass}/${s.total} (${s.total ? Math.round((s.pass / s.total) * 100) : 0}%)`]);
  }

  // Sheet 5: Footnotes
  const notes = wb.addWorksheet('Footnotes');
  notes.addRow([footnotesText({ template: args.template, factor: args.factor, periodStart: args.periodStart, periodEnd: args.periodEnd })]);
  notes.addRow([`BRSR Report generated on ${new Date().toISOString()}`]);
  notes.addRow(['This report follows the SEBI prescribed BRSR format per Circular SEBI/HO/CFD/CMD-2/P/CIR/2021/562']);

  const b = await wb.xlsx.writeBuffer();
  return Buffer.from(b as ArrayBuffer);
}
