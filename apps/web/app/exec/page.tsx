'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pie, PieChart, Cell } from 'recharts'
import { getJSON } from '@/lib/api'
import { useReportContext } from '../report-context'
import { Badge } from '@/components/ui/badge'
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { KpiGrid, LoadingState, PageHeader, SectionCard, StatCard, StatusBanner } from '@/components/product'

type ExecKpi = {
  name: string
  value: number | null
  delta: number | null
  status: 'GREEN' | 'YELLOW' | 'RED'
}

type Scope3Breakdown = {
  internal: number
  supplier: number
}

type ExecPayload = {
  mode: 'live' | 'snapshot'
  reportId: string
  isLocked: boolean
  periodStart: string
  periodEnd: string
  calcVersion: number
  completenessPercent: number
  scope3Breakdown?: Scope3Breakdown
  attribution?: string | null
  kpis: ExecKpi[]
}

export default function ExecPage() {
  const { reportId } = useReportContext()
  const onboarding = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('onboarding') === '1' : false
  const onboardingStep = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('step') : null
  const exec = useQuery({
    queryKey: ['exec-kpis', reportId],
    enabled: !!reportId,
    queryFn: async () => await getJSON<ExecPayload>(`/exec/${reportId}`)
  })

  const bullets = useMemo(() => buildBrief(exec.data), [exec.data])

  if (!reportId) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Executive Cockpit"
          description="Select a report from the Reports page to load executive KPI payload."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Cockpit"
        description="Backend-authored KPI payload for decision review and investor narratives."
      />

      {exec.data && (
        <StatusBanner
          testId="exec-mode-banner"
          tone={exec.data.mode === 'snapshot' ? 'success' : 'info'}
        >
          Mode: {exec.data.mode === 'snapshot' ? 'Snapshot' : 'Live'} • Period {exec.data.periodStart} → {exec.data.periodEnd}
          {exec.data.isLocked && (
            <span data-test="exec-calc-version-badge" className="ml-2">
              • Calc v{exec.data.calcVersion}
            </span>
          )}
        </StatusBanner>
      )}
      {onboarding && onboardingStep === '4' && (
        <StatusBanner testId="onboarding-tooltip-step-4" tone="info">
          Step 4 complete: Review KPIs in Exec. Next: invite suppliers from the Suppliers page.
        </StatusBanner>
      )}

      {exec.isPending && <LoadingState label="Loading KPIs…" />}
      {exec.isError && (
        <StatusBanner tone="danger">
          Failed to load executive KPIs.
        </StatusBanner>
      )}

      {exec.data && (
        <>
          <KpiGrid data-test="exec-kpi-grid">
            {exec.data.kpis.slice(0, 12).map((kpi) => (
              <KpiTile key={kpi.name} kpi={kpi} />
            ))}
          </KpiGrid>

          <SectionCard title="Scope 3 Breakdown">
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard
                label="Internal Scope 3"
                value={<span data-test="scope3-internal-breakdown">{formatValue(exec.data.scope3Breakdown?.internal ?? null)}</span>}
              />
              <StatCard
                label="Supplier Scope 3"
                value={<span data-test="scope3-supplier-breakdown">{formatValue(exec.data.scope3Breakdown?.supplier ?? null)}</span>}
              />
              <StatCard
                label="Coverage Delta"
                value={<span data-test="supplier-coverage-delta">{formatDelta(exec.data.kpis.find((k) => k.name === 'Supplier coverage %')?.delta)}</span>}
              />
            </div>
            <div className="mt-4">
              <ChartContainer className="mx-auto h-[260px] max-w-[460px]" config={execChartConfig}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Internal', value: exec.data.scope3Breakdown?.internal ?? 0, fill: 'var(--color-internal)' },
                      { name: 'Supplier', value: exec.data.scope3Breakdown?.supplier ?? 0, fill: 'var(--color-supplier)' },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    <Cell fill="var(--color-internal)" />
                    <Cell fill="var(--color-supplier)" />
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            </div>
            {exec.data.attribution && (
              <div data-test="scope3-attribution-note" className="mt-3 text-sm text-muted-foreground">
                {exec.data.attribution}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Executive Brief">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  )
}

const execChartConfig = {
  internal: {
    label: 'Internal',
    color: 'hsl(var(--chart-1))',
  },
  supplier: {
    label: 'Supplier',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig

function KpiTile({ kpi }: { kpi: ExecKpi }) {
  const tone =
    kpi.status === 'GREEN'
      ? 'bg-success/20 text-success'
      : kpi.status === 'YELLOW'
      ? 'bg-warning/20 text-warning-foreground'
      : 'bg-destructive/20 text-destructive'
  const delta = typeof kpi.delta === 'number' ? `${kpi.delta > 0 ? '+' : ''}${kpi.delta.toFixed(2)}%` : '—'
  return (
    <SectionCard className="p-3" title={<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.name}</span>}>
      <div data-test="exec-kpi-tile" className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight">
        {kpi.value === null ? '—' : Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(kpi.value)}
        </div>
        <div className="text-xs text-muted-foreground">
          Δ {delta} • <Badge className={tone}>{kpi.status}</Badge>
        </div>
      </div>
    </SectionCard>
  )
}

function buildBrief(payload: ExecPayload | undefined) {
  if (!payload) return []
  const total = payload.kpis.find((k) => k.name === 'Total emissions')
  const compliance = payload.kpis.find((k) => k.name === 'Compliance %')
  const quality = payload.kpis.find((k) => k.name === 'Data quality score')
  return [
    `Total emissions are ${formatValue(total?.value)} with delta ${formatDelta(total?.delta)} versus previous quarter.`,
    `Compliance is ${formatValue(compliance?.value)}% and in ${compliance?.status ?? 'YELLOW'} state.`,
    `Data quality score is ${formatValue(quality?.value)} with status ${quality?.status ?? 'YELLOW'}.`
  ]
}

function formatValue(value?: number | null) {
  if (typeof value !== 'number') return 'N/A'
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function formatDelta(delta?: number | null) {
  if (typeof delta !== 'number') return 'N/A'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`
}
