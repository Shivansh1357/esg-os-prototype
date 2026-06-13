import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import { Pool } from 'pg';
import { authHeaders } from './utils/jwt';
import { AppModule } from '../src/app.module';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });
jest.setTimeout(30000);

describe('auth login + set-password', () => {
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let memberId: string;
  const seed = Date.now();
  const adminEmail = `admin.auth.${seed}@example.com`;
  const memberEmail = `member.auth.${seed}@example.com`;
  const adminPassword = 'CorrectHorse9!';
  const newMemberPassword = 'BatteryStaple7!';

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      tenantId = (await client.query(`INSERT INTO esg.tenants(name) VALUES($1) RETURNING id`, [`AuthCo-${seed}`])).rows[0].id;
      // admin has a password; member starts without one (login-disabled)
      adminId = (await client.query(
        `INSERT INTO esg.users(tenant_id,email,role,status,password_hash)
         VALUES ($1,$2,'ADMIN','ACTIVE', crypt($3, gen_salt('bf'))) RETURNING id`,
        [tenantId, adminEmail, adminPassword],
      )).rows[0].id;
      memberId = (await client.query(
        `INSERT INTO esg.users(tenant_id,email,role,status) VALUES ($1,$2,'MEMBER','ACTIVE') RETURNING id`,
        [tenantId, memberEmail],
      )).rows[0].id;
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('logs in with correct credentials and returns a usable token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({ tenantId, userId: adminId, role: 'ADMIN', email: adminEmail });

    // the issued token authenticates a protected endpoint
    const me = await request(app.getHttpServer())
      .get('/entities')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(Array.isArray(me.body.entities)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `nobody.${seed}@example.com`, password: adminPassword });
    expect(res.status).toBe(401);
  });

  it('member without a password cannot log in until an admin sets one', async () => {
    const before = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: memberEmail, password: newMemberPassword });
    expect(before.status).toBe(401);

    // admin sets the member's password (authenticated, ADMIN)
    const set = await request(app.getHttpServer())
      .post('/auth/set-password')
      .set(authHeaders({ tenantId, userId: adminId, role: 'ADMIN' }))
      .send({ userId: memberId, password: newMemberPassword });
    expect(set.status).toBe(201);
    expect(set.body.ok).toBe(true);

    const after = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: memberEmail, password: newMemberPassword });
    expect(after.status).toBe(201);
    expect(after.body.user.role).toBe('MEMBER');
  });

  it('does not let a query string smuggle a protected route past auth', async () => {
    // A crafted query that contains a public path must NOT bypass auth on a
    // protected route (regression for substring-based path matching).
    const res = await request(app.getHttpServer())
      .get('/entities?redirect=/auth/login')
      .send();
    expect(res.status).toBe(401);
  });

  it('rejects set-password from a non-admin role', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/set-password')
      .set(authHeaders({ tenantId, userId: memberId, role: 'MEMBER' }))
      .send({ userId: memberId, password: 'AnotherPass1!' });
    expect(res.status).toBe(403);
  });
});
