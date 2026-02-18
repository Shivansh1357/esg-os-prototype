import { AsyncLocalStorage } from 'async_hooks';

export type TenantContext = { tenantId: string; userId: string; role: 'ADMIN'|'MEMBER'|'AUDITOR'|'SUPPLIER' };

export const ALS = new AsyncLocalStorage<TenantContext>();

export function getCtx() {
  const ctx = ALS.getStore();
  if (!ctx) throw new Error('Tenant context missing');
  return ctx;
}


