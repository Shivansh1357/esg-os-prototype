import { getClientRole } from '@/lib/role'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;
const API = process.env.NEXT_PUBLIC_API_URL!;
const headers = () => ({
  'Content-Type': 'application/json',
  ...(process.env.NEXT_PUBLIC_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_AUTH_TOKEN}` } : {}),
  'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
  'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
  'x-role': getClientRole(),
});

export async function gql<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const r = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}

export async function postJSON<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API}${path}`, { method:'POST', headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: 'GET',
    headers: headers(),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const AI = process.env.NEXT_PUBLIC_AI_URL || process.env.NEXT_PUBLIC_API_URL!;
export async function postAI<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${AI}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}


