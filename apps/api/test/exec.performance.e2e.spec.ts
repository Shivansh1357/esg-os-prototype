import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
const pool = new Pool({ connectionString });

jest.setTimeout(300000);

describe('exec KPI performance', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('returns get_exec_kpis under 400ms with 100k facts', async () => {
    const client = await pool.connect();
    const userId = '00000000-0000-0000-0000-00000000d8f2';
    try {
      await client.query('BEGIN');
      const tenantId = (await client.query(`INSERT INTO esg.tenants(name) VALUES('T-D8-PERF') RETURNING id`)).rows[0].id as string;
      const entityId = (await client.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES($1,'Perf Site','SITE') RETURNING id`,
        [tenantId]
      )).rows[0].id as string;
      const factorSetId = (await client.query(`SELECT id FROM esg.factor_sets ORDER BY created_at LIMIT 1`)).rows[0].id as string;
      await client.query(
        `INSERT INTO esg.tenant_defaults(tenant_id, factor_set_id) VALUES ($1,$2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
        [tenantId, factorSetId]
      );

      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);

      await client.query(
        `INSERT INTO esg.metrics(code, name, unit, scope)
         SELECT format('PERF_METRIC_%s', g), format('Perf Metric %s', g), 'kWh', 2
         FROM generate_series(1, 100) AS g
         ON CONFLICT (code) DO NOTHING`
      );

      await client.query(
        `INSERT INTO esg.entities(tenant_id, name, etype)
         SELECT $1, format('Perf Child %s', g), 'SITE'::esg.entity_type
         FROM generate_series(1, 1000) AS g`,
        [tenantId]
      );

      await client.query(
        `INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status,quality_flags)
         SELECT e.tenant_id, e.id, m.code, DATE '2025-07-01', DATE '2025-09-30',
                100 + ((row_number() OVER ()) % 50), 'kWh', 'APPROVED',
                CASE WHEN (row_number() OVER ()) % 20 = 0 THEN '{"outlier": true}'::jsonb ELSE '{}'::jsonb END
           FROM esg.entities e
           CROSS JOIN (
             SELECT code FROM esg.metrics WHERE code LIKE 'PERF_METRIC_%'
           ) m
          WHERE e.tenant_id = $1`,
        [tenantId]
      );

      await client.query(
        `INSERT INTO esg.facts(tenant_id,entity_id,metric_code,period_start,period_end,value,unit,status,quality_flags)
         VALUES ($1, $2, 'ELEC_KWH', DATE '2025-07-01', DATE '2025-09-30', 500, 'kWh', 'APPROVED', '{}'::jsonb)`,
        [tenantId, entityId]
      );

      await client.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [
        tenantId,
        entityId,
        '2025-07-01',
        '2025-09-30',
        factorSetId
      ]);
      await client.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenantId, '2025-07-01', '2025-09-30']);

      const reportId = (await client.query(
        `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
         VALUES ($1,'Perf Report','BRSR',$2,$3) RETURNING id`,
        [tenantId, '2025-07-01', '2025-09-30']
      )).rows[0].id as string;

      await client.query(`SELECT esg.get_exec_kpis($1,$2)`, [tenantId, reportId]);

      const started = Date.now();
      await client.query(`SELECT esg.get_exec_kpis($1,$2)`, [tenantId, reportId]);
      const elapsedMs = Date.now() - started;

      expect(elapsedMs).toBeLessThan(400);
      await client.query('ROLLBACK');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
});
