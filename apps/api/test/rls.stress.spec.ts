import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

const RLS_TEST_ROLE = 'esg_rls_tester';
const PERIOD_START = '2025-07-01';
const PERIOD_END = '2025-09-30';

type TenantFixture = {
  tenantId: string;
  tenantName: string;
  entityId: string;
  userId: string;
  factValue: number;
};

const FIXTURES: TenantFixture[] = [
  {
    tenantId: '00000000-0000-0000-0000-00000000e201',
    tenantName: 'T-RLS-STRESS-01',
    entityId: '00000000-0000-0000-0000-00000000e301',
    userId: '00000000-0000-0000-0000-00000000e401',
    factValue: 100,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e202',
    tenantName: 'T-RLS-STRESS-02',
    entityId: '00000000-0000-0000-0000-00000000e302',
    userId: '00000000-0000-0000-0000-00000000e402',
    factValue: 110,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e203',
    tenantName: 'T-RLS-STRESS-03',
    entityId: '00000000-0000-0000-0000-00000000e303',
    userId: '00000000-0000-0000-0000-00000000e403',
    factValue: 120,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e204',
    tenantName: 'T-RLS-STRESS-04',
    entityId: '00000000-0000-0000-0000-00000000e304',
    userId: '00000000-0000-0000-0000-00000000e404',
    factValue: 130,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e205',
    tenantName: 'T-RLS-STRESS-05',
    entityId: '00000000-0000-0000-0000-00000000e305',
    userId: '00000000-0000-0000-0000-00000000e405',
    factValue: 140,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e206',
    tenantName: 'T-RLS-STRESS-06',
    entityId: '00000000-0000-0000-0000-00000000e306',
    userId: '00000000-0000-0000-0000-00000000e406',
    factValue: 150,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e207',
    tenantName: 'T-RLS-STRESS-07',
    entityId: '00000000-0000-0000-0000-00000000e307',
    userId: '00000000-0000-0000-0000-00000000e407',
    factValue: 160,
  },
  {
    tenantId: '00000000-0000-0000-0000-00000000e208',
    tenantName: 'T-RLS-STRESS-08',
    entityId: '00000000-0000-0000-0000-00000000e308',
    userId: '00000000-0000-0000-0000-00000000e408',
    factValue: 170,
  },
];

let factorSetId = '';

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

async function withTenantContext<T>(fixture: TenantFixture, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await client.query('SET LOCAL row_security = on');
    await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [fixture.tenantId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [fixture.userId]);
    return fn(client);
  });
}

async function withOwnerTenantContext<T>(fixture: TenantFixture, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await client.query('SET LOCAL row_security = on');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [fixture.tenantId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [fixture.userId]);
    return fn(client);
  });
}

async function seedApprovedFact(fixture: TenantFixture): Promise<string> {
  return withTenantContext(fixture, async (client) => {
    const upsert = await client.query<{ id: string }>(
      `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id`,
      [
        fixture.tenantId,
        fixture.entityId,
        'ELEC_KWH',
        PERIOD_START,
        PERIOD_END,
        fixture.factValue,
        'kWh',
        'CSV',
        `s3://rls-stress/${fixture.tenantId}/fact.csv`,
        fixture.userId,
      ],
    );
    expect(upsert.rowCount).toBe(1);

    const factId = upsert.rows[0].id;
    await client.query(`SELECT id FROM esg.facts WHERE id = $1 FOR UPDATE`, [factId]);

    const approved = await client.query(
      `UPDATE esg.facts
          SET status = 'APPROVED'
        WHERE id = $1`,
      [factId],
    );
    expect(approved.rowCount).toBe(1);

    return factId;
  });
}

async function runRecalc(fixture: TenantFixture): Promise<string> {
  return withOwnerTenantContext(fixture, async (client) => {
    const recalc = await client.query<{ id: string }>(
      `SELECT (esg.recalc_emissions($1,$2,$3,$4,$5)).id AS id`,
      [fixture.tenantId, fixture.entityId, PERIOD_START, PERIOD_END, factorSetId],
    );
    expect(recalc.rowCount).toBe(1);
    return recalc.rows[0].id;
  });
}

describe('RLS stress isolation', () => {
  beforeAll(async () => {
    await withTransaction(async (client) => {
      await client.query(
        `DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
            CREATE ROLE ${RLS_TEST_ROLE};
          END IF;
        END $$`,
      );

      await client.query(`GRANT USAGE ON SCHEMA esg TO ${RLS_TEST_ROLE}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA esg TO ${RLS_TEST_ROLE}`);
      await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA esg TO ${RLS_TEST_ROLE}`);
      await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA esg TO ${RLS_TEST_ROLE}`);
      await client.query(`GRANT USAGE ON SCHEMA app TO ${RLS_TEST_ROLE}`);
      await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${RLS_TEST_ROLE}`);

      const factorSet = await client.query<{ id: string }>(
        `SELECT id
           FROM esg.factor_sets
          WHERE code = $1`,
        ['IN-CEA-2024'],
      );
      expect(factorSet.rowCount).toBe(1);
      factorSetId = factorSet.rows[0].id;

      for (const fixture of FIXTURES) {
        await client.query(
          `INSERT INTO esg.tenants (id, name)
           VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
          [fixture.tenantId, fixture.tenantName],
        );
      }
    });

    await Promise.all(
      FIXTURES.map((fixture) =>
        withTenantContext(fixture, async (client) => {
          await client.query(
            `INSERT INTO esg.entities (id, tenant_id, parent_id, name, etype)
             VALUES ($1, $2, NULL, $3, 'ORG')
             ON CONFLICT (id) DO UPDATE
                SET tenant_id = EXCLUDED.tenant_id,
                    parent_id = EXCLUDED.parent_id,
                    name = EXCLUDED.name,
                    etype = EXCLUDED.etype`,
            [fixture.entityId, fixture.tenantId, `${fixture.tenantName}-HQ`],
          );
        }),
      ),
    );
  });

  beforeEach(async () => {
    await Promise.all(
      FIXTURES.map((fixture) =>
        withTenantContext(fixture, async (client) => {
          await client.query(
            `DELETE FROM esg.emission_totals
              WHERE tenant_id = $1
                AND entity_id = $2
                AND period_start = $3
                AND period_end = $4`,
            [fixture.tenantId, fixture.entityId, PERIOD_START, PERIOD_END],
          );
          await client.query(
            `DELETE FROM esg.facts
              WHERE tenant_id = $1
                AND entity_id = $2
                AND period_start = $3
                AND period_end = $4
                AND metric_code = 'ELEC_KWH'`,
            [fixture.tenantId, fixture.entityId, PERIOD_START, PERIOD_END],
          );
        }),
      ),
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('parallel inserts remain tenant-isolated under concurrent writes', async () => {
    const factIds = await Promise.all(FIXTURES.map((fixture) => seedApprovedFact(fixture)));
    expect(new Set(factIds).size).toBe(FIXTURES.length);

    await Promise.all(
      FIXTURES.map((fixture) =>
        withTenantContext(fixture, async (client) => {
          const visibleFacts = await client.query<{ n: number | string }>(
            `SELECT count(*)::int AS n
               FROM esg.facts
              WHERE period_start = $1
                AND period_end = $2
                AND metric_code = 'ELEC_KWH'`,
            [PERIOD_START, PERIOD_END],
          );
          expect(Number(visibleFacts.rows[0].n)).toBe(1);

          const ownFact = await client.query<{ value: string; status: 'APPROVED' | 'DRAFT' }>(
            `SELECT value, status
               FROM esg.facts
              WHERE entity_id = $1
                AND period_start = $2
                AND period_end = $3
                AND metric_code = 'ELEC_KWH'`,
            [fixture.entityId, PERIOD_START, PERIOD_END],
          );
          expect(ownFact.rowCount).toBe(1);
          expect(Number(ownFact.rows[0].value)).toBe(fixture.factValue);
          expect(ownFact.rows[0].status).toBe('APPROVED');

          const mismatchedTenantRows = await client.query<{ n: number | string }>(
            `SELECT count(*)::int AS n
               FROM esg.facts
              WHERE tenant_id <> app.current_tenant()
                AND period_start = $1
                AND period_end = $2`,
            [PERIOD_START, PERIOD_END],
          );
          expect(Number(mismatchedTenantRows.rows[0].n)).toBe(0);
        }),
      ),
    );
  });

  it('parallel recalc across tenants stays isolated with deterministic per-tenant totals', async () => {
    await Promise.all(FIXTURES.map((fixture) => seedApprovedFact(fixture)));
    const recalcIds = await Promise.all(FIXTURES.map((fixture) => runRecalc(fixture)));
    expect(new Set(recalcIds).size).toBe(FIXTURES.length);

    const allTenantIds = FIXTURES.map((fixture) => fixture.tenantId);

    await Promise.all(
      FIXTURES.map((fixture) =>
        withTenantContext(fixture, async (client) => {
          const totals = await client.query<{
            id: string;
            tenant_id: string;
            scope2_loc: string | null;
            scope2_mkt: string | null;
            calc_version: number | string;
          }>(
            `SELECT id, tenant_id, scope2_loc, scope2_mkt, calc_version
               FROM esg.emission_totals
              WHERE entity_id = $1
                AND period_start = $2
                AND period_end = $3
                AND factor_set_id = $4`,
            [fixture.entityId, PERIOD_START, PERIOD_END, factorSetId],
          );
          expect(totals.rowCount).toBe(1);
          expect(totals.rows[0].tenant_id).toBe(fixture.tenantId);
          expect(Number(totals.rows[0].scope2_loc ?? 0)).toBeCloseTo(fixture.factValue * 0.7, 6);
          expect(Number(totals.rows[0].scope2_mkt ?? 0)).toBeCloseTo(fixture.factValue * 0.7, 6);
          expect(Number(totals.rows[0].calc_version)).toBe(1);

          const allTenantScopeView = await client.query<{ n: number | string }>(
            `SELECT count(*)::int AS n
               FROM esg.emission_totals
              WHERE tenant_id = ANY($1::uuid[])
                AND period_start = $2
                AND period_end = $3`,
            [allTenantIds, PERIOD_START, PERIOD_END],
          );
          expect(Number(allTenantScopeView.rows[0].n)).toBe(1);

          const mismatchedTenantRows = await client.query<{ n: number | string }>(
            `SELECT count(*)::int AS n
               FROM esg.emission_totals
              WHERE tenant_id <> app.current_tenant()
                AND period_start = $1
                AND period_end = $2`,
            [PERIOD_START, PERIOD_END],
          );
          expect(Number(mismatchedTenantRows.rows[0].n)).toBe(0);
        }),
      ),
    );
  });

  it('cross-tenant reads and updates are blocked by RLS', async () => {
    const owner = FIXTURES[0];
    const attacker = FIXTURES[1];
    const factId = await seedApprovedFact(owner);

    await withTenantContext(attacker, async (client) => {
      const readOtherTenantFact = await client.query<{ id: string; tenant_id: string; value: string }>(
        `SELECT id, tenant_id, value
           FROM esg.facts
          WHERE id = $1`,
        [factId],
      );
      expect(readOtherTenantFact.rowCount).toBe(0);

      const updateOtherTenantFact = await client.query(
        `UPDATE esg.facts
            SET value = $2
          WHERE id = $1`,
        [factId, 999],
      );
      expect(updateOtherTenantFact.rowCount).toBe(0);
    });

    await withTenantContext(owner, async (client) => {
      const ownerFact = await client.query<{ value: string; status: 'APPROVED' | 'DRAFT' }>(
        `SELECT value, status
           FROM esg.facts
          WHERE id = $1`,
        [factId],
      );
      expect(ownerFact.rowCount).toBe(1);
      expect(Number(ownerFact.rows[0].value)).toBe(owner.factValue);
      expect(ownerFact.rows[0].status).toBe('APPROVED');
    });
  });

  it('worker misuse with mismatched tenant context is rejected and writes nothing', async () => {
    const caller = FIXTURES[2];
    const wrongTarget = FIXTURES[3];
    await seedApprovedFact(wrongTarget);

    await expect(
      withTenantContext(caller, async (client) => {
        await client.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [
          wrongTarget.tenantId,
          wrongTarget.entityId,
          PERIOD_START,
          PERIOD_END,
          factorSetId,
        ]);
      }),
    ).rejects.toThrow(/tenant context mismatch/i);

    await withTenantContext(wrongTarget, async (client) => {
      const wrongTenantTotals = await client.query<{ n: number | string }>(
        `SELECT count(*)::int AS n
           FROM esg.emission_totals
          WHERE tenant_id = $1
            AND entity_id = $2
            AND period_start = $3
            AND period_end = $4
            AND factor_set_id = $5`,
        [wrongTarget.tenantId, wrongTarget.entityId, PERIOD_START, PERIOD_END, factorSetId],
      );
      expect(Number(wrongTenantTotals.rows[0].n)).toBe(0);
    });

    await withTenantContext(caller, async (client) => {
      const leakedTotals = await client.query<{ n: number | string }>(
        `SELECT count(*)::int AS n
           FROM esg.emission_totals
          WHERE entity_id = $1
            AND period_start = $2
            AND period_end = $3
            AND factor_set_id = $4`,
        [wrongTarget.entityId, PERIOD_START, PERIOD_END, factorSetId],
      );
      expect(Number(leakedTotals.rows[0].n)).toBe(0);
    });
  });
});
