'use client'

import { useState, useEffect } from 'react'
import { useReportContext } from '@/app/report-context'

export function appendReportId(to: string, reportId: string | null) {
  if (!reportId) return to
  if (to.startsWith('http://') || to.startsWith('https://') || to.startsWith('mailto:') || to.startsWith('tel:')) {
    return to
  }
  const [pathWithQuery, hash = ''] = to.split('#')
  const [path, query = ''] = pathWithQuery.split('?')
  const params = new URLSearchParams(query)
  params.set('reportId', reportId)
  const nextQuery = params.toString()
  return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
}

/**
 * Returns the href with reportId appended — but defers to after hydration
 * to avoid server/client mismatch (reportId comes from localStorage).
 */
export function useReportAwareLink(to: string) {
  const { reportId } = useReportContext()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // During SSR and initial hydration, return the plain href to match server output.
  // After mount, append the reportId from localStorage.
  if (!mounted) return to
  return appendReportId(to, reportId)
}
