import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { getCtx } from '../tenancy/als';

export type AppRole = 'ADMIN' | 'MEMBER' | 'AUDITOR' | 'SUPPLIER';

export function currentRole(): AppRole {
  return getCtx().role as AppRole;
}

export function requireRole(...allowed: AppRole[]) {
  const role = currentRole();
  if (!allowed.includes(role)) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }
}

const actionLimits = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(action: string, max = 20, windowMs = 60_000) {
  if (process.env.NODE_ENV === 'test' || process.env.E2E_TENANT_ID) return;
  const { tenantId, userId } = getCtx();
  const key = `${tenantId}:${userId}:${action}`;
  const now = Date.now();
  const existing = actionLimits.get(key);
  if (!existing || now >= existing.resetAt) {
    actionLimits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (existing.count >= max) {
    throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests' }, HttpStatus.TOO_MANY_REQUESTS);
  }
  existing.count += 1;
  actionLimits.set(key, existing);
}
