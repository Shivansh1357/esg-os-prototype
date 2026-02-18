export type ReportMeta = {
  id: string
  name: string
  template: string
  periodStart: string
  periodEnd: string
  isLocked: boolean
  factorSetId: string | null
  factorSetCode: string | null
  factorSetVersion: string | null
  calcVersion: number | null
  completenessPercent: number | null
  frozenAt: string | null
  complianceSnapshot: any[] | null
}

export type ReportListItem = {
  id: string
  name: string
  periodStart: string
  periodEnd: string
  isLocked: boolean
  calcVersion: number | null
  updatedAt: string
}

export function quarterRangeFromDate(date: string) {
  const d = new Date(date)
  const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
  const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0)
  return { periodStart: iso(qs), periodEnd: iso(qe) }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}
