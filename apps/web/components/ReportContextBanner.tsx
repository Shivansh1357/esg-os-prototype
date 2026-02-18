'use client'

import { ReportMeta } from '@/lib/reportMeta'

export default function ReportContextBanner({ meta }: { meta: ReportMeta | null | undefined }) {
  if (!meta) return null
  const quarter = quarterLabel(meta.periodStart)
  const text = meta.isLocked
    ? `Viewing Frozen Report — ${quarter}${meta.calcVersion ? ` (Calc v${meta.calcVersion})` : ''}`
    : `Viewing Draft Report — ${quarter}`
  return (
    <div
      data-test="report-context-banner"
      style={{
        margin: '0 0 12px',
        padding: 10,
        border: `1px solid ${meta.isLocked ? '#274' : '#345'}`,
        borderRadius: 8,
        background: meta.isLocked ? '#0f2318' : '#111a2b',
        fontSize: 13
      }}
    >
      {text}
    </div>
  )
}

function quarterLabel(periodStart: string) {
  const d = new Date(periodStart)
  const q = Math.floor(d.getMonth() / 3) + 1
  return `${d.getFullYear()} Q${q}`
}
