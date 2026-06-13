import type { AppRole } from '@/lib/role'

export type Session = {
  token: string
  tenantId: string
  userId: string
  role: AppRole
  email: string
}

const STORAGE_KEY = 'esg.session'

function envFallbackSession(): Session {
  const role = (process.env.NEXT_PUBLIC_USER_ROLE || 'ADMIN') as AppRole
  return {
    token: process.env.NEXT_PUBLIC_AUTH_TOKEN || '',
    tenantId: process.env.NEXT_PUBLIC_TENANT_ID || '',
    userId: process.env.NEXT_PUBLIC_USER_ID || '',
    role,
    email: '',
  }
}

function readStored(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (!parsed || typeof parsed.tenantId !== 'string' || typeof parsed.userId !== 'string') {
      return null
    }
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      tenantId: parsed.tenantId,
      userId: parsed.userId,
      role: (parsed.role || 'ADMIN') as AppRole,
      email: typeof parsed.email === 'string' ? parsed.email : '',
    }
  } catch {
    return null
  }
}

/**
 * Returns the stored localStorage session, or an env-derived fallback when none
 * exists (and during SSR). The env fallback keeps E2E/dev — which bake the
 * identity into NEXT_PUBLIC_* env vars — working without an explicit login.
 */
export function getSession(): Session {
  return readStored() ?? envFallbackSession()
}

export function setSession(s: Session): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

/** True only when a real localStorage session exists. */
export function hasStoredSession(): boolean {
  return readStored() !== null
}

/**
 * Authenticated if a stored session exists OR the build baked a non-empty
 * NEXT_PUBLIC_TENANT_ID (the E2E/dev case), which keeps those flows logged in.
 */
export function isAuthenticated(): boolean {
  if (hasStoredSession()) return true
  return typeof process.env.NEXT_PUBLIC_TENANT_ID === 'string' && process.env.NEXT_PUBLIC_TENANT_ID !== ''
}
