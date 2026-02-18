import { Client } from 'pg';
import * as jwt from 'jsonwebtoken';

export const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:esg@localhost:5432/esg-os';
export const jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';

export async function withClient<T>(fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function quarterRange(now = new Date()) {
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth + 3, 0));
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10)
  };
}

export function signJwt(payload: { tenantId: string; sub: string; role: 'ADMIN'|'MEMBER'|'AUDITOR' }) {
  return jwt.sign(payload, jwtSecret, { algorithm: 'HS256', expiresIn: '8h' });
}

export function readArg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}
