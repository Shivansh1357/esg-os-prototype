import * as crypto from 'crypto';

type Claims = { tid: string; sid: string; ps: string; pe: string; exp: number; iat: number; v: 1 };
const enc = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function mac(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function signSupplierToken(args: { tenantId: string; supplierId: string; periodStart: string; periodEnd: string; ttlHours: number }) {
  const secret = process.env.SUPPLIER_TOKEN_SECRET!;
  const claims: Claims = { tid: args.tenantId, sid: args.supplierId, ps: args.periodStart, pe: args.periodEnd, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+args.ttlHours*3600, v: 1 };
  const payload = enc(claims);
  const sig = mac(secret, `v1.${payload}`);
  return `v1.${payload}.${sig}`;
}

export function verifySupplierToken(token: string): Claims {
  const secret = process.env.SUPPLIER_TOKEN_SECRET!;
  const [v, payload, sig] = token.split('.');
  if (v !== 'v1' || !payload || !sig) throw new Error('bad token');
  const expect = mac(secret, `${v}.${payload}`);
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)) === false) throw new Error('bad sig');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Claims;
  if (claims.exp < Math.floor(Date.now()/1000)) throw new Error('expired');
  return claims;
}


