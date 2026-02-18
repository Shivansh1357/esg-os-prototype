'use client'

import { useMemo } from 'react'
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

export function useReportAwareLink(to: string) {
  const { reportId } = useReportContext()
  return useMemo(() => appendReportId(to, reportId), [to, reportId])
}
