'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type ReportContextValue = {
  reportId: string | null
  setReportId: (nextId: string | null) => void
}

const ReportContext = createContext<ReportContextValue | null>(null)

function readReportIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const idFromUrl = params.get('reportId')
  if (idFromUrl) {
    localStorage.setItem('reportId', idFromUrl)
    return idFromUrl
  }
  const cached = localStorage.getItem('reportId')
  return cached || null
}

export function ReportContextProvider({ children }: { children: React.ReactNode }) {
  const [reportId, setReportIdState] = useState<string | null>(readReportIdFromLocation)

  const syncFromLocation = () => {
    setReportIdState(readReportIdFromLocation())
  }

  useEffect(() => {
    syncFromLocation()
    const onPop = () => syncFromLocation()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setReportId = (nextId: string | null) => {
    setReportIdState(nextId)
    if (nextId) localStorage.setItem('reportId', nextId)
    else localStorage.removeItem('reportId')

    const params = new URLSearchParams(window.location.search)
    if (nextId) params.set('reportId', nextId)
    else params.delete('reportId')
    const q = params.toString()
    const nextUrl = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash || ''}`
    window.history.replaceState({}, '', nextUrl)
  }

  const value = useMemo<ReportContextValue>(() => ({ reportId, setReportId }), [reportId])
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>
}

export function useReportContext() {
  const value = useContext(ReportContext)
  if (!value) throw new Error('useReportContext must be used within ReportContextProvider')
  return value
}
