import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import { Pool } from 'pg';
import { authHeaders } from './utils/jwt';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });
jest.setTimeout(30000);

describe('exec cockpit HTTP integration', () => {
  let app: INestApplication;
  let tenantId: string;
  let entityId: string;
  let factorSetId: string;
  let draftReportId: string;
  let frozenReportId: string;
  const periodStart = '2025-07-01';
  const periodEnd = '2025-09-30';
  const userId = '00000000-0000-0000-0000-00000000d801';
  const seed = Date.now();

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    process.env.S3_BUCKET = process.env.S3_BUCKET ?? 'uploads';
    process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin';
    process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      tenantId = (await client.query(`INSERT INTO esg.tenants(name) VALUES($1) RETURNING id`, [`T-D8-HTTP-${seed}`])).rows[0].id;
      entityId = (await client.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG') RETURNING id`,
        [tenantId]
      )).rows[0].id;
      factorSetId = (await client.query(`SELECT id FROM esg.factor_sets ORDER BY created_at LIMIT 1`)).rows[0].id;

      await client.query(
        `INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id) VALUES ($1,$2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id = EXCLUDED.factor_set_id, updated_at = now()`,
        [tenantId, factorSetId]
      );
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
      await client.query(
        `INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status)
         VALUES ($1,$2,'ELEC_KWH',$3,$4,1000,'kWh','APPROVED')`,
        [tenantId, entityId, periodStart, periodEnd]
      );
      await client.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [tenantId, entityId, periodStart, periodEnd, factorSetId]);
      await client.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenantId, periodStart, periodEnd]);

      draftReportId = (await client.query(
        `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
         VALUES ($1,'D8 Draft','BRSR',$2,$3) RETURNING id`,
        [tenantId, periodStart, periodEnd]
      )).rows[0].id;

      frozenReportId = (await client.query(
        `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
         VALUES ($1,'D8 Frozen','BRSR',$2,$3) RETURNING id`,
        [tenantId, periodStart, periodEnd]
      )).rows[0].id;
      await client.query(`SELECT esg.freeze_report($1,$2,$3)`, [tenantId, frozenReportId, userId]);

      await client.query(
        `UPDATE esg.emission_totals
            SET scope1 = 123456
          WHERE tenant_id = $1 AND entity_id = $2 AND period_start = $3 AND period_end = $4 AND factor_set_id = $5`,
        [tenantId, entityId, periodStart, periodEnd, factorSetId]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const { AppModule } = await import('../src/app.module');
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('returns live for draft and snapshot for frozen report', async () => {
    const draftRes = await request(app.getHttpServer())
      .get(`/exec/${draftReportId}`)
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(draftRes.status).toBe(200);
    expect(draftRes.body.mode).toBe('live');
    expect(Array.isArray(draftRes.body.kpis)).toBe(true);
    expect(draftRes.body.kpis.length).toBeGreaterThan(0);

    const frozenRes = await request(app.getHttpServer())
      .get(`/exec/${frozenReportId}`)
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(frozenRes.status).toBe(200);
    expect(frozenRes.body.mode).toBe('snapshot');
    expect(frozenRes.body.isLocked).toBe(true);

    const total = frozenRes.body.kpis.find((k: any) => k.name === 'Total emissions');
    expect(total).toBeDefined();
    expect(Number(total.value)).not.toBe(123456);
  });
});
