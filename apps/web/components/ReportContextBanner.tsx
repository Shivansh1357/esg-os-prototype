'use client'

import { ReportMeta } from '@/lib/reportMeta'
import { cn } from '@/lib/utils'

export default function ReportContextBanner({ meta }: { meta: ReportMeta | null | undefined }) {
  if (!meta) return null
  const quarter = quarterLabel(meta.periodStart)
  const text = meta.isLocked
    ? `Viewing Frozen Report — ${quarter}${meta.calcVersion ? ` (Calc v${meta.calcVersion})` : ''}`
    : `Viewing Draft Report — ${quarter}`
  return (
    <div
      data-test="report-context-banner"
      className={cn(
        'mb-3 rounded-lg border px-3 py-2.5 text-sm font-medium',
        meta.isLocked
          ? 'border-success/35 bg-success/15 text-success'
          : 'border-primary/35 bg-primary/10 text-primary'
      )}
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
