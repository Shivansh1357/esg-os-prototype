export type AppRole = 'ADMIN' | 'MEMBER' | 'AUDITOR' | 'SUPPLIER'

export function getClientRole(): AppRole {
  const envRole = (process.env.NEXT_PUBLIC_USER_ROLE || 'ADMIN').toUpperCase()
  const modeRole = getRoleFromModeParam()
  const value = (modeRole || envRole) as AppRole
  if (value === 'ADMIN' || value === 'MEMBER' || value === 'AUDITOR' || value === 'SUPPLIER') return value
  return 'ADMIN'
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

