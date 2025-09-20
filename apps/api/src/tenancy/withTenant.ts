import { Injectable, NestMiddleware } from '@nestjs/common';
import { ALS, TenantContext } from './als';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

@Injectable()
export class WithTenantMiddleware implements NestMiddleware {
  async use(req: any, res: any, next: () => void) {
    const tenantId = (req.user?.tenantId ?? req.headers['x-tenant-id']) as string;
    const userId   = (req.user?.sub       ?? req.headers['x-user-id']) as string;
    const role     = (req.user?.role ?? req.headers['x-role'] ?? 'ADMIN') as TenantContext['role'];

    ALS.run({ tenantId, userId, role }, async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
        await client.query('SET LOCAL app.user_id = $1', [userId]);
        req.pg = client;

        res.on('finish', async () => {
          try { await client.query('COMMIT'); } finally { client.release(); }
        });
        res.on('close', async () => {
          try { await client.query('ROLLBACK'); } finally { client.release(); }
        });

        next();
      } catch (e) {
        try { await client.query('ROLLBACK'); } finally { client.release(); }
        throw e;
      }
    });
  }
}


