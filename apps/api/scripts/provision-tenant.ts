import { randomUUID } from 'crypto';
import { quarterRange, readArg, signJwt, withClient } from './pilot-common';

type RolePreset = 'admin' | 'member' | 'auditor';

async function main() {
  const tenantName = readArg('name', `Pilot Tenant ${Date.now()}`)!;
  const rolePreset = (readArg('role', 'admin') || 'admin').toLowerCase() as RolePreset;
  const presets = rolePreset.split(',').map((x) => x.trim()).filter(Boolean) as RolePreset[];
  const selected = new Set<RolePreset>(['admin', ...presets]);
  const q = quarterRange();

  const output = await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const tenant = await client.query(
        `INSERT INTO esg.tenants(name) VALUES ($1) RETURNING id`,
        [tenantName]
      );
      const tenantId = tenant.rows[0].id as string;

      const adminUser = await createUser(client, tenantId, 'ADMIN', `admin+${Date.now()}@pilot.local`);
      let memberUser: { id: string; email: string } | null = null;
      let auditorUser: { id: string; email: string } | null = null;
      if (selected.has('member')) memberUser = await createUser(client, tenantId, 'MEMBER', `member+${Date.now()}@pilot.local`);
      if (selected.has('auditor')) auditorUser = await createUser(client, tenantId, 'AUDITOR', `auditor+${Date.now()}@pilot.local`);

      const org = await client.query(
        `INSERT INTO esg.entities(tenant_id,name,etype) VALUES ($1,$2,'ORG') RETURNING id`,
        [tenantId, `${tenantName} Org`]
      );
      const entityId = org.rows[0].id as string;

      await ensureFactors(client, tenantId);
      const factorSet = await client.query(`SELECT factor_set_id FROM esg.tenant_defaults WHERE tenant_id = $1`, [tenantId]);
      const factorSetId = factorSet.rows[0].factor_set_id as string;

      const report = await client.query(
        `INSERT INTO esg.reports(tenant_id,name,template,period_start,period_end)
         VALUES ($1,$2,'BRSR',$3,$4) RETURNING id`,
        [tenantId, `${tenantName} - ${q.periodStart} Report`, q.periodStart, q.periodEnd]
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

      await client.query('COMMIT');

      const adminToken = signJwt({ tenantId, sub: adminUser.id, role: 'ADMIN' });
      return { tenantId, reportId, entityId, factorSetId, adminUser, memberUser, auditorUser, adminToken };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  console.log(`Provisioned tenant: ${tenantName}`);
  console.log(`tenantId=${output.tenantId}`);
  console.log(`reportId=${output.reportId}`);
  console.log(`entityId=${output.entityId}`);
  console.log(`factorSetId=${output.factorSetId}`);
  console.log(`admin.email=${output.adminUser.email}`);
  console.log(`admin.jwt=${output.adminToken}`);
  if (output.memberUser) console.log(`member.email=${output.memberUser.email}`);
  if (output.auditorUser) console.log(`auditor.email=${output.auditorUser.email}`);
  console.log(`\nLogin headers (if needed):`);
  console.log(`Authorization: Bearer ${output.adminToken}`);
}

async function createUser(client: any, tenantId: string, role: 'ADMIN'|'MEMBER'|'AUDITOR', email: string) {
  const r = await client.query(
    `INSERT INTO esg.users(tenant_id,email,role,status) VALUES ($1,$2,$3,'ACTIVE') RETURNING id,email`,
    [tenantId, email, role]
  );
  return { id: r.rows[0].id as string, email: r.rows[0].email as string };
}

async function ensureFactors(client: any, tenantId: string) {
  const fs = await client.query(
    `INSERT INTO esg.factor_sets(code,name,version,region)
     VALUES ('INDIA_CEA','India CEA Grid','latest','IN')
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
    `INSERT INTO esg.emission_factors(factor_set_id,metric_code,unit,loc_kgco2e_per_unit,mkt_kgco2e_per_unit)
     VALUES
       ($1,'ELEC_KWH','kWh',0.72,0.68),
       ($1,'FUEL_L','L',2.31,2.31),
       ($1,'TRAVEL_KM','km',0.12,0.12)
     ON CONFLICT (factor_set_id, metric_code) DO UPDATE
       SET unit=EXCLUDED.unit,
           loc_kgco2e_per_unit=EXCLUDED.loc_kgco2e_per_unit,
           mkt_kgco2e_per_unit=EXCLUDED.mkt_kgco2e_per_unit`,
    [factorSetId]
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
