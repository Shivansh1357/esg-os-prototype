'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { getJSON, gql } from '@/lib/api'
import { ReportMeta } from '@/lib/reportMeta'
import { useReportContext } from '../report-context'
import ReportContextBanner from '@/components/ReportContextBanner'
import { getClientRole } from '@/lib/role'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  KpiGrid,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBanner,
} from '@/components/product'

type Totals = {
  scope1: number | null
  scope2_loc: number | null
  scope2_mkt: number | null
  scope3: number | null
}

const GET_TOTALS = `
query T($entityId:String!, $periodStart:String!, $periodEnd:String!){
  getTotals(entityId:$entityId, periodStart:$periodStart, periodEnd:$periodEnd){
    scope1 scope2_loc scope2_mkt scope3
  }
}`

const RECALC = `
mutation R($entityId:String!, $periodStart:String!, $periodEnd:String!, $factorSetId:String!){
  recalc(entityId:$entityId, periodStart:$periodStart, periodEnd:$periodEnd, factorSetId:$factorSetId)
}
`

export default function EmissionsPage() {
  const { reportId } = useReportContext()
  const [entityId, setEntityId] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('entityId') : null) || '')
  const [date, setDate] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || todayISO())
  const factorSetId = process.env.NEXT_PUBLIC_DEFAULT_FACTOR_SET_ID
  const factorLabel = process.env.NEXT_PUBLIC_FACTOR_SET_LABEL || 'Default'
  const qc = useQueryClient()
  const role = getClientRole()
  const canRecalc = role === 'ADMIN'

  const { ps, pe, prevPs, prevPe } = useMemo(() => {
    const d = new Date(date)
    const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
    const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0)
    const pqs = new Date(qs.getFullYear(), qs.getMonth() - 3, 1)
    const pqe = new Date(pqs.getFullYear(), pqs.getMonth() + 3, 0)
    return { ps: iso(qs), pe: iso(qe), prevPs: iso(pqs), prevPe: iso(pqe) }
  }, [date])

  const selectedReport = useQuery({
    queryKey: ['report-meta', reportId],
    enabled: !!reportId,
    queryFn: async () => await getJSON<ReportMeta>(`/reports/${reportId}`)
  })
  const periodReport = useQuery({
    queryKey: ['report-meta-by-period', ps, pe, reportId],
    enabled: !reportId,
    queryFn: async () => await getJSON<ReportMeta | null>(`/reports/by-period?periodStart=${ps}&periodEnd=${pe}`)
  })
  const activeReport = selectedReport.data ?? periodReport.data ?? null
  const periodStart = activeReport?.periodStart ?? ps
  const periodEnd = activeReport?.periodEnd ?? pe
  const isFrozenPeriod = !!activeReport?.isLocked

  useEffect(() => { localStorage.setItem('entityId', entityId) }, [entityId])
  useEffect(() => { localStorage.setItem('qstart', date) }, [date])

  const cur = useQuery({
    queryKey: ['totals', entityId, periodStart, periodEnd],
    enabled: !!entityId,
    queryFn: async () => {
      const data = await gql<{ getTotals: Totals | null }>(GET_TOTALS, { entityId, periodStart, periodEnd })
      return data.getTotals
    }
  })
  const prev = useQuery({
    queryKey: ['totals', entityId, prevPs, prevPe],
    enabled: !!entityId,
    queryFn: async () => {
      const data = await gql<{ getTotals: Totals | null }>(GET_TOTALS, { entityId, periodStart: prevPs, periodEnd: prevPe })
      return data.getTotals
    }
  })

  const deltas = useMemo(() => {
    if (!cur.data || !prev.data) return null
    const pct = (c: number | null, p: number | null) => (c == null || p == null || p === 0 ? null : round(((c - p) / p) * 100, 2))
    return {
      s1: pct(cur.data.scope1, prev.data.scope1),
      s2l: pct(cur.data.scope2_loc, prev.data.scope2_loc),
      s2m: pct(cur.data.scope2_mkt, prev.data.scope2_mkt),
      s3: pct(cur.data.scope3, prev.data.scope3),
    }
  }, [cur.data, prev.data])

  const [notice, setNotice] = useState<string | null>(null)
  const recalc = useMutation({
    mutationFn: async () => {
      if (!factorSetId) return false
      await gql<{ recalc: boolean }>(RECALC, { entityId, periodStart, periodEnd, factorSetId })
      return true
    },
    onSuccess: async () => {
      setNotice('Recalculation enqueued. Updating data...')
      await qc.invalidateQueries({ queryKey: ['totals', entityId, periodStart, periodEnd] })
      setTimeout(() => setNotice(null), 1200)
    },
    onError: (e: any) => setNotice(e?.message || 'Failed to enqueue recalculation')
  })

  const chartData = useMemo(() => {
    const current = cur.data
    const previous = prev.data
    return [
      { metric: 'Scope 1', current: current?.scope1 ?? 0, previous: previous?.scope1 ?? 0 },
      { metric: 'Scope 2 Loc', current: current?.scope2_loc ?? 0, previous: previous?.scope2_loc ?? 0 },
      { metric: 'Scope 2 Mkt', current: current?.scope2_mkt ?? 0, previous: previous?.scope2_mkt ?? 0 },
      { metric: 'Scope 3', current: current?.scope3 ?? 0, previous: previous?.scope3 ?? 0 },
    ]
  }, [cur.data, prev.data])

  return (
    <div className="space-y-4">
      <ReportContextBanner meta={activeReport} />
      <PageHeader
        title="Emissions Explorer"
        description="Analyze Scope 1/2/3 totals by period and compare against prior quarter."
        right={(
          <div className="flex flex-wrap items-center gap-2">
            <FactorPicker factorSetId={factorSetId} label={factorLabel} />
            <Button
              data-test="recalc-button"
              onClick={() => recalc.mutate()}
              disabled={!entityId || recalc.isPending || isFrozenPeriod || !factorSetId || !canRecalc}
              title={
                isFrozenPeriod
                  ? 'Report is frozen. Unlocking requires creating a new report version.'
                  : !canRecalc
                  ? 'Insufficient permissions.'
                  : !factorSetId
                  ? 'No factor set configured.'
                  : 'Recalculate totals for this quarter'
              }
            >
              {recalc.isPending ? 'Recalculating...' : 'Recalculate'}
            </Button>
          </div>
        )}
      />

      {isFrozenPeriod && (
        <StatusBanner tone="success" testId="frozen-period-banner">
          <b>Frozen Snapshot</b> - this quarter is locked. Recalculation is disabled.
          <div data-test="calc-version-badge" className="mt-1 text-xs">
            Calc Version: {activeReport?.calcVersion ?? '—'}
          </div>
        </StatusBanner>
      )}

      <SectionCard title="Filters">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Entity ID</Label>
            <Input placeholder="paste entity UUID" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Quarter start</Label>
            <Input type="date" value={toQuarterStart(date)} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Period</Label>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              {periodStart} → {periodEnd}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Prev. quarter</Label>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              {prevPs} → {prevPe}
            </div>
          </div>
        </div>
      </SectionCard>

      {notice && <StatusBanner tone="info" testId="recalc-notice">{notice}</StatusBanner>}

      <KpiGrid>
        <Card title="Scope 1" value={cur.data?.scope1} deltaPct={deltas?.s1} />
        <Card title="Scope 2 (loc)" value={cur.data?.scope2_loc} deltaPct={deltas?.s2l} />
        <Card title="Scope 2 (mkt)" value={cur.data?.scope2_mkt} deltaPct={deltas?.s2m} />
        <Card title="Scope 3" value={cur.data?.scope3} deltaPct={deltas?.s3} />
      </KpiGrid>

      <SectionCard title="Quarter-over-Quarter Comparison">
        <ChartContainer
          className="h-[320px] w-full"
          config={chartConfig}
        >
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="metric" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Bar dataKey="current" fill="var(--color-current)" radius={6} />
            <Bar dataKey="previous" fill="var(--color-previous)" radius={6} />
          </BarChart>
        </ChartContainer>
      </SectionCard>
    </div>
  )
}

const chartConfig = {
  current: {
    label: "Current quarter",
    color: "hsl(var(--chart-1))",
  },
  previous: {
    label: "Previous quarter",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

function Card({ title, value, deltaPct }: { title: string, value: number | null | undefined, deltaPct?: number | null }) {
  const v = value ?? 0
  const hasDelta = typeof deltaPct === 'number'
  const color = hasDelta ? (deltaPct! <= 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground'
  const deltaTxt = hasDelta ? `${deltaPct! > 0 ? '▲' : deltaPct! < 0 ? '▼' : ''} ${Math.abs(deltaPct!).toFixed(2)}%` : '—'
  return (
    <StatCard
      label={title}
      value={<>{formatNumber(v)} <span className="text-xs font-medium text-muted-foreground">kgCO2e</span></>}
      hint={<span className={color}>{deltaTxt} vs prev qtr</span>}
    />
  )
}

function FactorPicker({ factorSetId, label }: { factorSetId?: string, label?: string }) {
  if (!factorSetId) return <Badge variant="outline">Factor set: default (view-only)</Badge>
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Factor set</span>
      <Select defaultValue={factorSetId}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={factorSetId}>{label || 'Default'}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function iso(d: Date) { return d.toISOString().slice(0, 10) }
function toQuarterStart(s: string) {
  const d = new Date(s)
  const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
  return iso(qs)
}
function todayISO() { return iso(new Date()) }
function round(n: number, p = 2) { return Math.round(n * 10 ** p) / 10 ** p }
function formatNumber(n: number) {
  try { return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n) }
  catch { return String(n) }
}
