import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

const TENANT_ID = '00000000-0000-0000-0000-00000000d2e1';
const ENTITY_ID = '00000000-0000-0000-0000-00000000d2e2';
const USER_ID = '00000000-0000-0000-0000-00000000d2e3';

const PERIOD_START = '2025-07-01';
const PERIOD_END = '2025-09-30';

const FACTOR_CODE_A = 'IN-CEA-2024';
const FACTOR_CODE_B = 'IN-CEA-2024-INST';

interface TotalsSnapshot {
  scope1: number;
  scope2Loc: number;
  scope2Mkt: number;
  scope3: number;
  calcVersion: number;
}

let factorSetA = '';
let factorSetB = '';

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function withTenantContext<T>(tenantId: string, userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    return fn(client);
  });
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

async function seedApprovedFact(value: number): Promise<string> {
  return withTenantContext(TENANT_ID, USER_ID, async (client) => {
    const upsert = await client.query<{ id: string }>(
      `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id`,
      [
        TENANT_ID,
        ENTITY_ID,
        'ELEC_KWH',
        PERIOD_START,
        PERIOD_END,
        value,
        'kWh',
        'CSV',
        's3://determinism/fact.csv',
        USER_ID,
      ],
    );

    const factId = upsert.rows[0].id;
    await client.query(`SELECT id FROM esg.facts WHERE id = $1 FOR UPDATE`, [factId]);
    await client.query(`UPDATE esg.facts SET status = 'APPROVED' WHERE id = $1`, [factId]);
    return factId;
  });
}

async function runRecalc(factorSetId: string): Promise<string> {
  return withTenantContext(TENANT_ID, USER_ID, async (client) => {
    const res = await client.query<{ id: string }>(
      `SELECT (esg.recalc_emissions($1,$2,$3,$4,$5)).id AS id`,
      [TENANT_ID, ENTITY_ID, PERIOD_START, PERIOD_END, factorSetId],
    );
    expect(res.rowCount).toBe(1);
    return res.rows[0].id;
  });
}

async function loadTotals(factorSetId: string): Promise<TotalsSnapshot> {
  return withTenantContext(TENANT_ID, USER_ID, async (client) => {
    const res = await client.query<{
      scope1: string | null;
      scope2_loc: string | null;
      scope2_mkt: string | null;
      scope3: string | null;
      calc_version: number | string;
    }>(
      `SELECT scope1, scope2_loc, scope2_mkt, scope3, calc_version
         FROM esg.emission_totals
        WHERE tenant_id = $1
          AND entity_id = $2
          AND period_start = $3
          AND period_end = $4
          AND factor_set_id = $5`,
      [TENANT_ID, ENTITY_ID, PERIOD_START, PERIOD_END, factorSetId],
    );

    expect(res.rowCount).toBe(1);
    const row = res.rows[0];

    return {
      scope1: toNumber(row.scope1),
      scope2Loc: toNumber(row.scope2_loc),
      scope2Mkt: toNumber(row.scope2_mkt),
      scope3: toNumber(row.scope3),
      calcVersion: Number(row.calc_version),
    };
  });
}

async function countTotalsRows(factorSetId: string): Promise<number> {
  return withTenantContext(TENANT_ID, USER_ID, async (client) => {
    const res = await client.query<{ n: number | string }>(
      `SELECT count(*)::int AS n
         FROM esg.emission_totals
        WHERE tenant_id = $1
          AND entity_id = $2
          AND period_start = $3
          AND period_end = $4
          AND factor_set_id = $5`,
      [TENANT_ID, ENTITY_ID, PERIOD_START, PERIOD_END, factorSetId],
    );
    return Number(res.rows[0].n);
  });
}

describe('emissions determinism invariance', () => {
  beforeAll(async () => {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO esg.tenants (id, name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [TENANT_ID, 'T-EMISSIONS-DETERMINISM'],
      );

      await client.query(
        `INSERT INTO esg.entities (id, tenant_id, parent_id, name, etype)
         VALUES ($1, $2, NULL, $3, 'ORG')
         ON CONFLICT (id) DO UPDATE
           SET tenant_id = EXCLUDED.tenant_id,
               parent_id = EXCLUDED.parent_id,
               name = EXCLUDED.name,
               etype = EXCLUDED.etype`,
        [ENTITY_ID, TENANT_ID, 'Determinism HQ'],
      );

      const fsA = await client.query<{ id: string }>(
        `SELECT id
           FROM esg.factor_sets
          WHERE code = $1`,
        [FACTOR_CODE_A],
      );
      expect(fsA.rowCount).toBe(1);
      factorSetA = fsA.rows[0].id;

      await client.query(
        `INSERT INTO esg.factor_sets (code, name, region, version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING`,
        [FACTOR_CODE_B, 'India CEA 2024 Institutional Variant', 'IN', '2024B'],
      );

      const fsB = await client.query<{ id: string }>(
        `SELECT id
           FROM esg.factor_sets
          WHERE code = $1`,
        [FACTOR_CODE_B],
      );
      expect(fsB.rowCount).toBe(1);
      factorSetB = fsB.rows[0].id;

      await client.query(
        `INSERT INTO esg.emission_factors (factor_set_id, metric_code, unit, loc_kgco2e_per_unit, mkt_kgco2e_per_unit)
         VALUES ($1, 'ELEC_KWH', 'kWh', 0.55, 0.55)
         ON CONFLICT (factor_set_id, metric_code) DO UPDATE
           SET unit = EXCLUDED.unit,
               loc_kgco2e_per_unit = EXCLUDED.loc_kgco2e_per_unit,
               mkt_kgco2e_per_unit = EXCLUDED.mkt_kgco2e_per_unit`,
        [factorSetB],
      );

      await client.query(
        `INSERT INTO esg.tenant_defaults (tenant_id, factor_set_id)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id) DO UPDATE
           SET factor_set_id = EXCLUDED.factor_set_id,
               updated_at = now()`,
        [TENANT_ID, factorSetA],
      );
    });
  });

  beforeEach(async () => {
    await withTenantContext(TENANT_ID, USER_ID, async (client) => {
      await client.query(
        `DELETE FROM esg.emission_totals
         WHERE tenant_id = $1
           AND entity_id = $2
           AND period_start = $3
           AND period_end = $4`,
        [TENANT_ID, ENTITY_ID, PERIOD_START, PERIOD_END],
      );

      await client.query(
        `DELETE FROM esg.facts
         WHERE tenant_id = $1
           AND entity_id = $2
           AND period_start = $3
           AND period_end = $4`,
        [TENANT_ID, ENTITY_ID, PERIOD_START, PERIOD_END],
      );
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('same inputs produce identical totals and deterministic version progression', async () => {
    await seedApprovedFact(100);

    await runRecalc(factorSetA);
    const first = await loadTotals(factorSetA);

    await runRecalc(factorSetA);
    const second = await loadTotals(factorSetA);

    expect(first.scope1).toBeCloseTo(0, 6);
    expect(first.scope2Loc).toBeCloseTo(70, 6);
    expect(first.scope2Mkt).toBeCloseTo(70, 6);
    expect(first.scope3).toBeCloseTo(0, 6);

    expect(second.scope1).toBeCloseTo(first.scope1, 6);
    expect(second.scope2Loc).toBeCloseTo(first.scope2Loc, 6);
    expect(second.scope2Mkt).toBeCloseTo(first.scope2Mkt, 6);
    expect(second.scope3).toBeCloseTo(first.scope3, 6);
    expect(second.calcVersion).toBe(first.calcVersion + 1);
  });

  it('recalc without any data change keeps totals identical and increments version by exactly one', async () => {
    await seedApprovedFact(100);

    await runRecalc(factorSetA);
    const baseline = await loadTotals(factorSetA);

    await runRecalc(factorSetA);
    const afterNoChange = await loadTotals(factorSetA);

    expect(afterNoChange.scope1).toBeCloseTo(baseline.scope1, 6);
    expect(afterNoChange.scope2Loc).toBeCloseTo(baseline.scope2Loc, 6);
    expect(afterNoChange.scope2Mkt).toBeCloseTo(baseline.scope2Mkt, 6);
    expect(afterNoChange.scope3).toBeCloseTo(baseline.scope3, 6);
    expect(afterNoChange.calcVersion - baseline.calcVersion).toBe(1);
  });

  it('factor set switch produces different totals for the same approved fact set', async () => {
    await seedApprovedFact(100);

    await runRecalc(factorSetA);
    const totalsA = await loadTotals(factorSetA);

    await runRecalc(factorSetB);
    const totalsB = await loadTotals(factorSetB);

    expect(totalsA.scope2Loc).toBeCloseTo(70, 6);
    expect(totalsA.scope2Mkt).toBeCloseTo(70, 6);

    expect(totalsB.scope2Loc).toBeCloseTo(55, 6);
    expect(totalsB.scope2Mkt).toBeCloseTo(55, 6);

    expect(totalsA.scope2Loc).not.toBeCloseTo(totalsB.scope2Loc, 6);
    expect(totalsA.scope2Mkt).not.toBeCloseTo(totalsB.scope2Mkt, 6);

    expect(totalsA.calcVersion).toBe(1);
    expect(totalsB.calcVersion).toBe(1);
  });

  it('parallel recalc calls do not create duplicate totals rows and version remains deterministic', async () => {
    await seedApprovedFact(100);

    const [recalcIdA, recalcIdB] = await Promise.all([runRecalc(factorSetA), runRecalc(factorSetA)]);

    const totals = await loadTotals(factorSetA);
    const rowCount = await countTotalsRows(factorSetA);

    expect(recalcIdA).toBe(recalcIdB);
    expect(rowCount).toBe(1);
    expect(totals.scope2Loc).toBeCloseTo(70, 6);
    expect(totals.scope2Mkt).toBeCloseTo(70, 6);
    expect(totals.calcVersion).toBe(2);
  });
});
