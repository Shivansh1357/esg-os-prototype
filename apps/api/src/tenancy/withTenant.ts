import { Injectable, NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import { ALS, TenantContext } from './als';
import { Pool } from 'pg';

@Injectable()
export class WithTenantMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async onModuleDestroy() {
    await this.pool.end();
  }

  async use(req: any, res: any, next: () => void) {
    const pathProbe = `${String(req.originalUrl || '')} ${String(req.url || '')} ${String(req.path || '')}`;
    if (pathProbe.includes('/health') || pathProbe.includes('/metrics') || pathProbe.includes('/s/') || pathProbe.includes('/public/')) {
      next();
      return;
    }

    const authMode = (process.env.AUTH_MODE || 'hybrid').toLowerCase();
    const allowHeaderFallback = authMode === 'header' || authMode === 'hybrid';

    const tenantId = (req.user?.tenantId ?? (allowHeaderFallback ? req.headers['x-tenant-id'] : undefined)) as string;
    const userId   = (req.user?.sub       ?? (allowHeaderFallback ? req.headers['x-user-id'] : undefined)) as string;
    const rawRole = String(req.user?.role ?? (allowHeaderFallback ? req.headers['x-role'] : undefined) ?? 'ADMIN').toUpperCase();
    const allowedRoles: TenantContext['role'][] = ['ADMIN', 'MEMBER', 'AUDITOR', 'SUPPLIER'];
    const role = (allowedRoles.includes(rawRole as TenantContext['role']) ? rawRole : null) as TenantContext['role'] | null;

    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Missing tenant/user context (x-tenant-id, x-user-id)' });
      return;
    }
    if (!role) {
      res.status(401).json({ error: 'Invalid role (x-role)' });
      return;
    }

    ALS.run({ tenantId, userId, role }, async () => {
      const client = await this.pool.connect();
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


