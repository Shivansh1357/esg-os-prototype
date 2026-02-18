import * as jwt from 'jsonwebtoken'

type Role = 'ADMIN' | 'MEMBER' | 'AUDITOR'

export function signE2eJwt(input: { tenantId: string; userId: string; role: Role }) {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret'
  return jwt.sign(
    {
      tenantId: input.tenantId,
      sub: input.userId,
      role: input.role
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' }
  )
}

export function makeAuthHeaders(input: { tenantId: string; userId: string; role: Role }) {
  const token = signE2eJwt(input)
  return {
    authorization: `Bearer ${token}`
  }
}

