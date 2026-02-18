import { randomUUID } from 'crypto';
import { quarterRange, signJwt, withClient } from './pilot-common';

async function main() {
  const tenantName = `Pilot Demo ${Date.now()}`;
  const q = quarterRange();

  const seeded = await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const tenant = await client.query(`INSERT INTO esg.tenants(name) VALUES ($1) RETURNING id`, [tenantName]);
      const tenantId = tenant.rows[0].id as string;
      const user = await client.query(
        `INSERT INTO esg.users(tenant_id,email,role,status) VALUES ($1,$2,'ADMIN','ACTIVE') RETURNING id,email`,
        [tenantId, `admin+demo-${Date.now()}@pilot.local`]
      );
      const userId = user.rows[0].id as string;

      const org = await client.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES ($1,$2,'ORG') RETURNING id`,
        [tenantId, `${tenantName} Org`]
      );
      const entityId = org.rows[0].id as string;

      const fs = await client.query(
        `INSERT INTO esg.factor_sets(code,name,version,region)
         VALUES ('IN-CEA-PILOT','India CEA Pilot','2026','IN')
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`
      );
      const factorSetId = fs.rows[0].id as string;
      await client.query(
        `INSERT INTO esg.tenant_defaults(tenant_id,factor_set_id)
         VALUES ($1,$2)
         ON CONFLICT (tenant_id) DO UPDATE SET factor_set_id=EXCLUDED.factor_set_id, updated_at=now()`,
        [tenantId, factorSetId]
      );

      await client.query(
        `INSERT INTO esg.metrics(code,name,unit,scope) VALUES
           ('ELEC_KWH','Electricity consumption','kWh',2),
           ('FUEL_L','Fuel consumption','L',1),
           ('TRAVEL_KM','Business travel','km',3)
         ON CONFLICT (code) DO NOTHING`
      );
      await client.query(
        `INSERT INTO esg.emission_factors(factor_set_id,metric_code,unit,loc_kgco2e_per_unit,mkt_kgco2e_per_unit) VALUES
           ($1,'ELEC_KWH','kWh',0.72,0.68),
           ($1,'FUEL_L','L',2.31,2.31),
           ($1,'TRAVEL_KM','km',0.12,0.12)
         ON CONFLICT (factor_set_id, metric_code) DO UPDATE
           SET unit=EXCLUDED.unit,
               loc_kgco2e_per_unit=EXCLUDED.loc_kgco2e_per_unit,
               mkt_kgco2e_per_unit=EXCLUDED.mkt_kgco2e_per_unit`,
        [factorSetId]
      );

      await client.query(
        `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
         VALUES ($1,$2,'BRSR',$3,$4)`,
        [tenantId, `${tenantName} - Pilot Report`, q.periodStart, q.periodEnd]
      );
      const report = await client.query(
        `SELECT id FROM esg.reports WHERE tenant_id=$1 AND period_start=$2 AND period_end=$3 ORDER BY created_at DESC LIMIT 1`,
        [tenantId, q.periodStart, q.periodEnd]
      );
      const reportId = report.rows[0].id as string;
      await client.query(
        `INSERT INTO esg.report_sections (tenant_id, report_id, code, title, status) VALUES
         ($1, $2, 'SUMMARY', 'Executive Summary', 'DRAFT'),
         ($1, $2, 'EMISSIONS', 'Emissions Overview', 'DRAFT'),
         ($1, $2, 'COMPLIANCE', 'BRSR Compliance', 'DRAFT')
         ON CONFLICT DO NOTHING`,
        [tenantId, reportId]
      );

      const factInputs = [
        ['FUEL_L', 1200, 'L'],
        ['ELEC_KWH', 5200, 'kWh'],
        ['TRAVEL_KM', 1800, 'km'],
        ['FUEL_L', 1100, 'L'],
        ['ELEC_KWH', 5000, 'kWh'],
        ['TRAVEL_KM', 1650, 'km'],
        ['ELEC_KWH', 5400, 'kWh'],
        ['FUEL_L', 980, 'L'],
      ] as const;

      for (const [metricCode, value, unit] of factInputs) {
        const up = await client.query(
          `SELECT esg.upsert_fact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id`,
          [tenantId, entityId, metricCode, q.periodStart, q.periodEnd, value, unit, 'UPLOAD', `seed://${metricCode}`, userId]
        );
        await client.query(`UPDATE esg.facts SET status='APPROVED' WHERE id=$1`, [up.rows[0].id]);
      }

      await client.query(
        `INSERT INTO esg.compliance_rules(code, framework, description, metric_code, requires_evidence, severity)
         VALUES
          ('BRSR-ELEC','BRSR_CORE','Electricity data present','ELEC_KWH',false,'MEDIUM'),
          ('BRSR-FUEL','BRSR_CORE','Fuel data present','FUEL_L',false,'MEDIUM')
         ON CONFLICT (code) DO NOTHING`
      );
      await client.query(`SELECT esg.evaluate_brsr($1,$2,$3)`, [tenantId, q.periodStart, q.periodEnd]);

      const s1 = await client.query(
        `INSERT INTO esg.suppliers(tenant_id,name,email,category,spend,status) VALUES ($1,$2,$3,$4,$5,'INVITED') RETURNING id`,
        [tenantId, 'Supplier One', `supplier1+${Date.now()}@demo.local`, 'Purchased Goods', 100000]
      );
      const s2 = await client.query(
        `INSERT INTO esg.suppliers(tenant_id,name,email,category,spend,status) VALUES ($1,$2,$3,$4,$5,'INVITED') RETURNING id`,
        [tenantId, 'Supplier Two', `supplier2+${Date.now()}@demo.local`, 'Purchased Goods', 80000]
      );
      const supplier1Id = s1.rows[0].id as string;
      const supplier2Id = s2.rows[0].id as string;
      await client.query(
        `INSERT INTO esg.supplier_invites(tenant_id,supplier_id,period_start,period_end,invited_email,expires_at)
         VALUES ($1,$2,$3,$4,$5,now() + interval '7 day')`,
        [tenantId, supplier1Id, q.periodStart, q.periodEnd, `supplier1+${Date.now()}@demo.local`]
      );
      await client.query(
        `INSERT INTO esg.supplier_invites(tenant_id,supplier_id,period_start,period_end,invited_email,expires_at)
         VALUES ($1,$2,$3,$4,$5,now() + interval '7 day')`,
        [tenantId, supplier2Id, q.periodStart, q.periodEnd, `supplier2+${Date.now()}@demo.local`]
      );
      await client.query(
        `INSERT INTO esg.supplier_responses(tenant_id,supplier_id,period_start,period_end,status,emissions_kgco2e,category,data_quality_tier,approved)
         VALUES ($1,$2,$3,$4,'SUBMITTED',$5,$6,'PRIMARY',true),
                ($1,$7,$3,$4,'SUBMITTED',$8,$6,'SECONDARY',false)`,
        [tenantId, supplier1Id, q.periodStart, q.periodEnd, 2200, 'Purchased Goods', supplier2Id, 1500]
      );

      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(`SELECT esg.recalc_emissions($1,$2,$3,$4,$5)`, [tenantId, entityId, q.periodStart, q.periodEnd, factorSetId]);
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
      await client.query(`SELECT esg.freeze_report($1,$2,$3)`, [tenantId, reportId, userId]);
      await client.query(`SELECT esg.get_exec_kpis($1,$2)`, [tenantId, reportId]);
      await client.query(`SELECT esg.record_pilot_event($1, 'supplier_invite', 2)`, [tenantId]);
      await client.query('COMMIT');

      return { tenantId, userId, reportId, entityId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });

  const token = signJwt({ tenantId: seeded.tenantId, sub: seeded.userId, role: 'ADMIN' });
  console.log(`Seeded pilot demo tenant.`);
  console.log(`tenantId=${seeded.tenantId}`);
  console.log(`reportId=${seeded.reportId}`);
  console.log(`entityId=${seeded.entityId}`);
  console.log(`admin.jwt=${token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
