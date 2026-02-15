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

    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Missing tenant/user context (x-tenant-id, x-user-id)' });
      return;
    }

    ALS.run({ tenantId, userId, role }, async () => {
      const client = await pool.connect();
      let finalized = false;
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
        await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
        req.pg = client;

        const finalize = async (mode: 'commit' | 'rollback') => {
          if (finalized) return;
          finalized = true;
          try {
            if (mode === 'commit') await client.query('COMMIT');
            else await client.query('ROLLBACK');
          } finally {
            client.release();
          }
        };

        res.once('finish', () => { void finalize('commit'); });
        res.once('close', () => { void finalize('rollback'); });

        next();
      } catch (e) {
        finalized = true;
        try { await client.query('ROLLBACK'); } finally { client.release(); }
        throw e;
      }
    });
  }
}


