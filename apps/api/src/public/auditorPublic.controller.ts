import { Controller, Get, Param, Post } from '@nestjs/common';
import { Pool } from 'pg';
import { verifyAuditorToken } from './auditorToken';
import ExcelJS from 'exceljs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  region:'us-east-1',
  forcePathStyle:true,
  endpoint: process.env.S3_ENDPOINT,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }
});

@Controller()
export class AuditorPublicController {
  @Get('/public/auditor/:token/lineage')
  async lineage(@Param('token') token: string) {
    const c = verifyAuditorToken(token);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [c.tid]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, ['AUDITOR']);
      const res = await client.query(`SELECT esg.report_lineage($1,$2) j`, [c.tid, c.rid]);
      await client.query('ROLLBACK');
      return res.rows[0].j;
    } finally { client.release(); }
  }

  @Post('/public/auditor/:token/assurance')
  async assurance(@Param('token') token: string): Promise<{url:string}> {
    const c = verifyAuditorToken(token);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [c.tid]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, ['AUDITOR']);
      const { rows:[{ j }] } = await client.query(`SELECT esg.report_lineage($1,$2) j`, [c.tid, c.rid]);
      const key = `assurance/${c.tid}/${c.rid}/${Date.now()}.xlsx`;
      const buf = await buildAssuranceWorkbook(j);
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: buf, ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ACL: 'private' }));
      await client.query('COMMIT');
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }), { expiresIn: 3600 });
      return { url };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
}

async function buildAssuranceWorkbook(lineage: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cover = wb.addWorksheet('Cover');
  cover.addRow([lineage.report.name]);
  cover.addRow([`Template`, lineage.report.template]);
  cover.addRow([`Version`, lineage.report.version]);
  cover.addRow([`Period`, lineage.report.periodStart, 'to', lineage.report.periodEnd]);
  cover.addRow([`Locked`, String(lineage.report.locked)]);
  cover.addRow([`Factor Set`, lineage.factorSet?.code || 'N/A', lineage.factorSet?.version || '']);
  const totals = wb.addWorksheet('Totals');
  totals.addRow(['Entity', 'Scope1', 'Scope2 Loc', 'Scope2 Mkt', 'Scope3']);
  for (const e of lineage.entities || []) {
    totals.addRow([e.name, e.totals?.scope1||0, e.totals?.scope2_loc||0, e.totals?.scope2_mkt||0, e.totals?.scope3||0]);
  }
  const facts = wb.addWorksheet('Facts');
  facts.addRow(['Entity','Metric','Unit','Value','Source','Approved At','Outlier','Factor (loc)','Factor (mkt)']);
  for (const e of lineage.entities || []) {
    for (const f of e.facts || []) {
      facts.addRow([e.name, f.metricCode, f.unit, f.value, f.sourceRef||'', f.approvedAt||'', f.outlier? 'YES':'', f.factors?.loc||'', f.factors?.mkt||'']);
    }
  }
  const ev = wb.addWorksheet('Evidence');
  ev.addRow(['Rule','Status','Reason','URL']);
  for (const ex of lineage.evidence || []) {
    ev.addRow([ex.rule_code || ex.ruleCode, ex.status, ex.reason, ex.evidence_url || ex.evidenceUrl || '']);
  }
  const notes = wb.addWorksheet('Notes');
  notes.addRow(['Metric','Unit','Loc Factor','Mkt Factor']);
  for (const n of lineage.notes || []) {
    notes.addRow([n.metricCode, n.unit, n.locFactor, n.mktFactor ?? '']);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}


