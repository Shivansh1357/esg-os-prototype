import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { verifySupplierToken } from './token';
import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

@Controller()
export class PublicController {
  @Get('/s/:token')
  async info(@Param('token') token: string) {
    const c = verifySupplierToken(token);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [c.tid]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [`SUPPLIER:${c.sid}`]);
      const s = await client.query(
        `SELECT name, email, category, spend FROM esg.suppliers WHERE id=$1 AND tenant_id=app.current_tenant()`,
        [c.sid]
      );
      await client.query('ROLLBACK');
      if (s.rowCount === 0) throw new Error('invalid supplier');
      return { supplier: s.rows[0], periodStart: c.ps, periodEnd: c.pe };
    } finally { client.release(); }
  }

  @Post('/s/:token')
  async submit(@Param('token') token: string, @Body() body: { emissionsKgCO2e?: number; evidenceUrl?: string; activity?: any }) {
    const c = verifySupplierToken(token);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [c.tid]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [`SUPPLIER:${c.sid}`]);
      if (body.evidenceUrl) {
        const v = await client.query(`SELECT esg.validate_evidence_url($1) ok`, [body.evidenceUrl]);
        if (!v.rows[0]?.ok) throw new Error('Invalid evidence URL');
      }
      await client.query(
        `INSERT INTO esg.supplier_responses(tenant_id,supplier_id,period_start,period_end,status,emissions_kgco2e,activity,evidence_url)
         VALUES (app.current_tenant(), $1, $2, $3, 'SUBMITTED', $4, $5, $6)
         ON CONFLICT (tenant_id, supplier_id, period_start, period_end)
         DO UPDATE SET status='SUBMITTED', emissions_kgco2e=EXCLUDED.emissions_kgco2e, activity=EXCLUDED.activity, evidence_url=EXCLUDED.evidence_url, submitted_at=now()`,
        [c.sid, c.ps, c.pe, body.emissionsKgCO2e ?? null, body.activity ?? {}, body.evidenceUrl ?? null]
      );
      await client.query(`UPDATE esg.suppliers SET status='RESPONDED' WHERE id=$1 AND tenant_id=app.current_tenant()`, [c.sid]);
      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  }

  @Post('/public/upload')
  async publicUpload(@Query('token') token: string, @Body() body: { filename: string; contentType: string }) {
    const c = verifySupplierToken(token);
    const s3 = new S3Client({
      region: 'us-east-1',
      forcePathStyle: true,
      endpoint: process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }
    });
    const key = `supplier-responses/${c.tid}/${c.sid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${(body.filename.split('.').pop()||'bin')}`;
    const { url, fields } = await createPresignedPost(s3, {
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Conditions: [ ['content-length-range', 1, 25*1024*1024], ['starts-with', '$Content-Type', ''], ['eq', '$acl', 'private'] ],
      Fields: { 'Content-Type': body.contentType, acl: 'private' },
      Expires: 300
    });
    return { s3Key: key, post: { url, fields } };
  }
}


