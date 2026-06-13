export type AppRole = 'ADMIN' | 'MEMBER' | 'AUDITOR' | 'SUPPLIER'

export function getClientRole(): AppRole {
  const storedRole = getRoleFromStoredSession()
  if (storedRole) return storedRole
  const envRole = (process.env.NEXT_PUBLIC_USER_ROLE || 'ADMIN').toUpperCase()
  const modeRole = getRoleFromModeParam()
  const value = (modeRole || envRole) as AppRole
  if (value === 'ADMIN' || value === 'MEMBER' || value === 'AUDITOR' || value === 'SUPPLIER') return value
  return 'ADMIN'
}

function getRoleFromStoredSession(): AppRole | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('esg.session')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { role?: string }
    const value = (parsed?.role || '').toUpperCase() as AppRole
    if (value === 'ADMIN' || value === 'MEMBER' || value === 'AUDITOR' || value === 'SUPPLIER') return value
    return null
  } catch {
    return null
  }
}

export function isAuditorView() {
  return getClientRole() === 'AUDITOR'
}

function getRoleFromModeParam(): AppRole | null {
  if (typeof window === 'undefined') return null
  const mode = (new URLSearchParams(window.location.search).get('mode') || '').toLowerCase()
  if (mode === 'auditor') return 'AUDITOR'
  if (mode === 'member') return 'MEMBER'
  if (mode === 'admin') return 'ADMIN'
  return null
}

