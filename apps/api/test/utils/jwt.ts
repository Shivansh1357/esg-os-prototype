import * as jwt from 'jsonwebtoken';

export function signTestJwt(input: { tenantId: string; userId: string; role: 'ADMIN' | 'MEMBER' | 'AUDITOR' }) {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  return jwt.sign(
    {
      tenantId: input.tenantId,
      sub: input.userId,
      role: input.role,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

export function authHeaders(input: { tenantId: string; userId: string; role: 'ADMIN' | 'MEMBER' | 'AUDITOR' }) {
  const token = signTestJwt(input);
  return {
    Authorization: `Bearer ${token}`,
  };
}

