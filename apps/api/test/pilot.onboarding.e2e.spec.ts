import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import { Pool } from 'pg';
import { authHeaders } from './utils/jwt';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });
jest.setTimeout(30000);

describe('pilot onboarding endpoints', () => {
  let app: INestApplication;
  let tenantId: string;
  let userId: string;
  let reportId: string;
  const seed = Date.now();

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      tenantId = (await client.query(`INSERT INTO esg.tenants(name) VALUES($1) RETURNING id`, [`T-PILOT-${seed}`])).rows[0].id;
      userId = (await client.query(
        `INSERT INTO esg.users(tenant_id,email,role,status) VALUES ($1,$2,'ADMIN','ACTIVE') RETURNING id`,
        [tenantId, `pilot-${seed}@example.com`]
      )).rows[0].id;
      await client.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES ($1,'HQ','ORG')`,
        [tenantId]
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

  it('creates starter report and stores feedback', async () => {
    const start = await request(app.getHttpServer())
      .post('/pilot/start-first-report')
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }))
      .send({});
    expect(start.status).toBe(201);
    expect(start.body.reportId).toBeDefined();
    reportId = start.body.reportId;

    const checklist = await request(app.getHttpServer())
      .get('/pilot/onboarding/checklist')
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(checklist.status).toBe(200);
    expect(Array.isArray(checklist.body.items)).toBe(true);
    expect(checklist.body.percent).toBeGreaterThanOrEqual(0);

    const fb = await request(app.getHttpServer())
      .post('/feedback')
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }))
      .send({ page: '/reports', message: 'Onboarding is clear', rating: 4 });
    expect(fb.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/feedback')
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);

    const stats = await request(app.getHttpServer())
      .get('/pilot/stats')
      .set(authHeaders({ tenantId, userId, role: 'ADMIN' }));
    expect(stats.status).toBe(200);
    expect(Array.isArray(stats.body.tenants)).toBe(true);
    expect(stats.body.summary).toBeDefined();
  });
});
