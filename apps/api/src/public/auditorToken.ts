import crypto from 'crypto';
type Claims = { v:1; tid:string; rid:string; ps:string; pe:string; exp:number; iat:number };
const enc = (o:any)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const mac = (s:string,d:string)=>crypto.createHmac('sha256', s).update(d).digest('base64url');

export function signAuditorToken(args:{tenantId:string; reportId:string; periodStart:string; periodEnd:string; ttlHours:number}) {
  const secret = process.env.AUDITOR_TOKEN_SECRET!;
  const now = Math.floor(Date.now()/1000);
  const claims:Claims = { v:1, tid:args.tenantId, rid:args.reportId, ps:args.periodStart, pe:args.periodEnd, iat:now, exp: now + args.ttlHours*3600 };
  const payload = enc(claims);
  const sig = mac(secret, `v1.${payload}`);
  return `v1.${payload}.${sig}`;
}
export function verifyAuditorToken(token:string):Claims {
  const secret = process.env.AUDITOR_TOKEN_SECRET!;
  const [v,p,s] = token.split('.');
  if (v!=='v1' || !p || !s) throw new Error('bad token');
  const expected = mac(secret, `${v}.${p}`);
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) throw new Error('bad sig');
  const claims = JSON.parse(Buffer.from(p,'base64url').toString()) as Claims;
  if (claims.exp < Math.floor(Date.now()/1000)) throw new Error('expired');
  return claims;
}


