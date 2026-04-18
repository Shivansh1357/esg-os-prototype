import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

async function withCtx<T>(tenant: string, user: string, fn: (c: any) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [user]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

describe('D3 recalc acceptance', () => {
  let tenant: string;
  let entity: string;
  let factorSetId: string;

  beforeAll(async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      tenant = (await c.query(`INSERT INTO esg.tenants(name) VALUES('T-D3-E2E') RETURNING id`)).rows[0].id;
      entity = (await c.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'HQ','ORG') RETURNING id`,
        [tenant]
      )).rows[0].id;
      factorSetId = (await c.query(`SELECT id FROM esg.factor_sets WHERE code='IN-CEA-2024'`)).rows[0].id;
      await c.query(
        `INSERT INTO esg.tenant_defaults(tenant_id,factor_set_id) VALUES($1,$2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
        [tenant, factorSetId]
      );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  async function runWorkerRecalc(payload: {
    tenantId: string;
    entityId: string;
    periodStart: string;
    periodEnd: string;
    factorSetId: string;
  }) {
    return runWorkerRecalcWithContext(payload.tenantId, payload);
  }

  async function runWorkerRecalcWithContext(
    contextTenantId: string,
    payload: {
      tenantId: string;
      entityId: string;
      periodStart: string;
      periodEnd: string;
      factorSetId: string;
    }
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [contextTenantId]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, ['00000000-0000-0000-0000-000000000001']);
      await client.query(
        `SELECT (esg.recalc_emissions($1,$2,$3,$4,$5)).id AS id`,
        [payload.tenantId, payload.entityId, payload.periodStart, payload.periodEnd, payload.factorSetId]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  it('approve -> worker recalc -> totals and calc_version increment', async () => {
    const periodStart = '2025-07-01';
    const periodEnd = '2025-09-30';
    const user = '00000000-0000-0000-0000-00000000d3e2';

    const factId = await withCtx(tenant, user, async (c) => {
      const id = (await c.query(
        `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id`,
        [tenant, entity, 'ELEC_KWH', periodStart, periodEnd, 100, 'kWh', 'CSV', 's3://seed', user]
      )).rows[0].id as string;
      await c.query(`SELECT id FROM esg.facts WHERE id=$1 FOR UPDATE`, [id]);
      await c.query(`UPDATE esg.facts SET status='APPROVED' WHERE id=$1`, [id]);
      return id;
    });
    expect(factId).toBeDefined();

    await runWorkerRecalc(
      { tenantId: tenant, entityId: entity, periodStart, periodEnd, factorSetId },
    );

    const first = await withCtx(tenant, user, async (c) => {
      return c.query(
        `SELECT scope1, scope2_loc, scope2_mkt, scope3, calc_version
           FROM esg.emission_totals
          WHERE tenant_id=$1 AND entity_id=$2 AND period_start=$3 AND period_end=$4 AND factor_set_id=$5`,
        [tenant, entity, periodStart, periodEnd, factorSetId]
      );
    });
    expect(first.rowCount).toBe(1);
    expect(Number(first.rows[0].scope2_loc)).toBeCloseTo(70, 6);
    expect(Number(first.rows[0].scope2_mkt)).toBeCloseTo(70, 6);
    expect(Number(first.rows[0].scope1 ?? 0)).toBeCloseTo(0, 6);
    expect(Number(first.rows[0].scope3 ?? 0)).toBeCloseTo(0, 6);
    expect(Number(first.rows[0].calc_version)).toBe(1);

    await runWorkerRecalc(
      { tenantId: tenant, entityId: entity, periodStart, periodEnd, factorSetId },
    );

    const second = await withCtx(tenant, user, async (c) => {
      return c.query(
        `SELECT calc_version
           FROM esg.emission_totals
          WHERE tenant_id=$1 AND entity_id=$2 AND period_start=$3 AND period_end=$4 AND factor_set_id=$5`,
        [tenant, entity, periodStart, periodEnd, factorSetId]
      );
    });
    expect(second.rowCount).toBe(1);
    expect(Number(second.rows[0].calc_version)).toBe(2);
  });

  it('rejects worker recalc when tenant context and payload tenant mismatch', async () => {
    const periodStart = '2025-07-01';
    const periodEnd = '2025-09-30';
    const user = '00000000-0000-0000-0000-00000000d3e2';
    const client = await pool.connect();
    let alt: { tenantId: string; entityId: string } | null = null;
    try {
      await client.query('BEGIN');
      const tenantId = (await client.query(`INSERT INTO esg.tenants(name) VALUES('T-D3-E2E-ALT') RETURNING id`)).rows[0].id as string;
      const entityId = (
        await client.query(
          `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'ALT-HQ','ORG') RETURNING id`,
          [tenantId]
        )
      ).rows[0].id as string;
      await client.query('COMMIT');
      alt = { tenantId, entityId };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    expect(alt).toBeTruthy();

    await expect(
      runWorkerRecalcWithContext(tenant, {
        tenantId: alt!.tenantId,
        entityId: alt!.entityId,
        periodStart,
        periodEnd,
        factorSetId,
      })
    ).rejects.toThrow(/tenant context mismatch/i);

    const totals = await withCtx(alt!.tenantId, user, async (c) => {
      return c.query(
        `SELECT count(*)::int AS n
           FROM esg.emission_totals
          WHERE tenant_id = $1
            AND entity_id = $2
            AND period_start = $3
            AND period_end = $4
            AND factor_set_id = $5`,
        [alt!.tenantId, alt!.entityId, periodStart, periodEnd, factorSetId]
      );
    });
    expect(Number(totals.rows[0].n)).toBe(0);
  });
});
