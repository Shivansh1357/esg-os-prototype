import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import { Pool } from 'pg';
import { authHeaders } from './utils/jwt';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });
jest.setTimeout(60000);

describe('supplier scope3 lifecycle', () => {
  let app: INestApplication;
  let tenantId: string;
  let orgEntityId: string;
  let factorSetId: string;
  const periodStart = '2025-07-01';
  const periodEnd = '2025-09-30';
  const userId = '00000000-0000-0000-0000-00000000d701';
  const seed = Date.now();

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    process.env.SUPPLIER_TOKEN_SECRET = process.env.SUPPLIER_TOKEN_SECRET ?? 'supplier-dev-secret';
    process.env.PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5050';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      tenantId = (await client.query(`INSERT INTO esg.tenants(name) VALUES($1) RETURNING id`, [`T-D7-SCOPE3-${seed}`])).rows[0].id;
      orgEntityId = (await client.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'ORG Root','ORG') RETURNING id`,
        [tenantId]
      )).rows[0].id;
      factorSetId = (await client.query(`SELECT id FROM esg.factor_sets ORDER BY created_at LIMIT 1`)).rows[0].id;
      await client.query(
        `INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id) VALUES ($1,$2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
        [tenantId, factorSetId]
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

  it('invites suppliers, accepts two responses, approves, and yields 66.67% count coverage', async () => {
    const inviteRes = await request(app.getHttpServer())
      .post('/suppliers/invite')
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }))
      .send({
        periodStart,
        periodEnd,
        suppliers: [
          { name: 'S1', email: `s1-${seed}@d7.local`, category: 'Purchased goods', spend: 100 },
          { name: 'S2', email: `s2-${seed}@d7.local`, category: 'Purchased goods', spend: 100 },
          { name: 'S3', email: `s3-${seed}@d7.local`, category: 'Purchased goods', spend: 100 }
        ]
      });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.count).toBe(3);

    const links = inviteRes.body.invites.map((x: any) => String(x.url));
    const token1 = links[0].split('/').pop();
    const token2 = links[1].split('/').pop();
    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();

    const submit1 = await request(app.getHttpServer()).post(`/s/${token1}`).send({
      emissionsKgCO2e: 10,
      dataQualityTier: 'PRIMARY'
    });
    const submit2 = await request(app.getHttpServer()).post(`/s/${token2}`).send({
      emissionsKgCO2e: 20,
      dataQualityTier: 'PRIMARY'
    });
    expect(submit1.status).toBe(201);
    expect(submit2.status).toBe(201);

    const responsesRes = await request(app.getHttpServer())
      .get(`/suppliers/responses?periodStart=${periodStart}&periodEnd=${periodEnd}`)
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(responsesRes.status).toBe(200);
    expect(responsesRes.body.length).toBe(2);

    for (const row of responsesRes.body) {
      const approve = await request(app.getHttpServer())
        .post('/suppliers/responses/approve')
        .set(authHeaders({ tenantId, userId, role: 'ADMIN' }))
        .send({ responseId: row.id });
      expect(approve.status).toBe(201);
      expect(approve.body.ok).toBe(true);
    }

    const coverageRes = await request(app.getHttpServer())
      .get(`/suppliers/coverage?periodStart=${periodStart}&periodEnd=${periodEnd}`)
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(coverageRes.status).toBe(200);
    expect(Number(coverageRes.body.coverageByCountPercent)).toBe(66.67);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);

      await client.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [
        tenantId,
        orgEntityId,
        periodStart,
        periodEnd,
        factorSetId
      ]);

      const totals = await client.query(
        `SELECT scope3
           FROM esg.emission_totals
          WHERE tenant_id=$1 AND entity_id=$2 AND period_start=$3 AND period_end=$4 AND factor_set_id=$5`,
        [tenantId, orgEntityId, periodStart, periodEnd, factorSetId]
      );
      expect(Number(totals.rows[0].scope3)).toBe(30);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
