import { Request } from 'express';
import { PoolClient } from 'pg';

export function pgClientFrom(req: Request): PoolClient {
  const client = (req as any).pg as PoolClient | undefined;
  if (!client) {
    throw new Error('PG client missing on request');
  }
  return client;
}


