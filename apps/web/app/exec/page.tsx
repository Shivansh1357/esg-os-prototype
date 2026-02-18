'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON } from '@/lib/api'
import { useReportContext } from '../report-context'

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
      <div>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Executive Cockpit</h2>
        <small>Select a report from Reports page to view KPI cockpit.</small>
      </div>
    )
  }

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Executive Cockpit</h2>
          <small>Backend-authored KPI payload for decision review.</small>
        </div>
      </header>

      {exec.data && (
        <div
          data-test="exec-mode-banner"
          style={{
            marginTop: 12,
            padding: 10,
            border: `1px solid ${exec.data.mode === 'snapshot' ? '#274' : '#345'}`,
            borderRadius: 8,
            background: exec.data.mode === 'snapshot' ? '#0f2318' : '#111a2b',
            fontSize: 13
          }}
        >
          Mode: {exec.data.mode === 'snapshot' ? 'Snapshot' : 'Live'} • Period {exec.data.periodStart} → {exec.data.periodEnd}
          {exec.data.isLocked && (
            <span data-test="exec-calc-version-badge" style={{ marginLeft: 8 }}>
              • Calc v{exec.data.calcVersion}
            </span>
          )}
        </div>
      )}
      {onboarding && onboardingStep === '4' && (
        <div data-test="onboarding-tooltip-step-4" style={{ marginTop: 10, padding: 10, border: '1px solid #345', borderRadius: 8, background: '#111a2b' }}>
          Step 4 complete: Review KPIs in Exec. Next: invite suppliers from the Suppliers page.
        </div>
      )}

      {exec.isPending && <p style={{ marginTop: 12 }}>Loading KPIs…</p>}
      {exec.isError && (
        <div style={{ marginTop: 12, padding: 10, border: '1px solid #442222', background: '#2a1420', borderRadius: 8 }}>
          Failed to load executive KPIs.
        </div>
      )}

      {exec.data && (
        <>
          <section
            data-test="exec-kpi-grid"
            style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px,1fr))', gap: 12 }}
          >
            {exec.data.kpis.slice(0, 12).map((kpi) => (
              <KpiTile key={kpi.name} kpi={kpi} />
            ))}
          </section>

          <section style={{ marginTop: 12, border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
            <h3 style={{ marginTop: 0 }}>Scope 3 Breakdown</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px,1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Internal Scope 3</div>
                <div data-test="scope3-internal-breakdown" style={{ fontSize: 22, fontWeight: 600 }}>
                  {formatValue(exec.data.scope3Breakdown?.internal ?? null)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Supplier Scope 3</div>
                <div data-test="scope3-supplier-breakdown" style={{ fontSize: 22, fontWeight: 600 }}>
                  {formatValue(exec.data.scope3Breakdown?.supplier ?? null)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Coverage Delta</div>
                <div data-test="supplier-coverage-delta" style={{ fontSize: 22, fontWeight: 600 }}>
                  {formatDelta(exec.data.kpis.find((k) => k.name === 'Supplier coverage %')?.delta)}
                </div>
              </div>
            </div>
            {exec.data.attribution && (
              <div data-test="scope3-attribution-note" style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                {exec.data.attribution}
              </div>
            )}
          </section>

          <section style={{ marginTop: 16, border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
            <h3 style={{ marginTop: 0 }}>Executive Brief</h3>
            <ul style={{ margin: '6px 0 0 18px' }}>
              {bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function KpiTile({ kpi }: { kpi: ExecKpi }) {
  const tone = kpi.status === 'GREEN' ? '#0d2f21' : kpi.status === 'YELLOW' ? '#5e4d16' : '#3a0b0b'
  const delta = typeof kpi.delta === 'number' ? `${kpi.delta > 0 ? '+' : ''}${kpi.delta.toFixed(2)}%` : '—'
  return (
    <div data-test="exec-kpi-tile" style={{ border: `1px solid ${tone}`, borderRadius: 10, padding: 12, background: '#0b1020' }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{kpi.name}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>
        {kpi.value === null ? '—' : Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(kpi.value)}
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        Δ {delta} • <span>{kpi.status}</span>
      </div>
    </div>
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
