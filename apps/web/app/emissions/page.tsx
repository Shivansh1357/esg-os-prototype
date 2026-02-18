'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getJSON, gql } from '@/lib/api'
import { ReportMeta } from '@/lib/reportMeta'
import { useReportContext } from '../report-context'
import ReportContextBanner from '@/components/ReportContextBanner'
import { getClientRole } from '@/lib/role'

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

  return (
    <div>
      <ReportContextBanner meta={activeReport} />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Emissions Explorer</h2>
          <small style={{ opacity: 0.8 }}>Pick entity and quarter to view Scope 1/2/3 totals.</small>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <FactorPicker factorSetId={factorSetId} label={factorLabel} />
          <button
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
          </button>
        </div>
      </header>

      {isFrozenPeriod && (
        <div data-test="frozen-period-banner" style={{ margin: '8px 0 12px', padding: 10, border: '1px solid #274', borderRadius: 8, background: '#0f2318' }}>
          <b>Frozen Snapshot</b> - this quarter is locked. Recalculation is disabled.
          <div data-test="calc-version-badge" style={{ marginTop: 6, fontSize: 12 }}>Calc Version: {activeReport?.calcVersion ?? '—'}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <label>Entity ID</label>
          <input placeholder="paste entity UUID" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </div>
        <div>
          <label>Quarter start</label>
          <input type="date" value={toQuarterStart(date)} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Period</label>
          <div style={{ padding: 8, border: '1px solid #233', borderRadius: 8 }}>{periodStart} → {periodEnd}</div>
        </div>
        <div>
          <label>Prev. quarter</label>
          <div style={{ padding: 8, border: '1px solid #233', borderRadius: 8 }}>{prevPs} → {prevPe}</div>
        </div>
      </div>

      {notice && <div data-test="recalc-notice" style={{ margin: '10px 0 16px', padding: 10, border: '1px solid #335', borderRadius: 8, background: '#0f1630' }}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px,1fr))', gap: 12, marginTop: 8 }}>
        <Card title="Scope 1" value={cur.data?.scope1} deltaPct={deltas?.s1} />
        <Card title="Scope 2 (loc)" value={cur.data?.scope2_loc} deltaPct={deltas?.s2l} />
        <Card title="Scope 2 (mkt)" value={cur.data?.scope2_mkt} deltaPct={deltas?.s2m} />
        <Card title="Scope 3" value={cur.data?.scope3} deltaPct={deltas?.s3} />
      </div>
    </div>
  )
}

function Card({ title, value, deltaPct }: { title: string, value: number | null | undefined, deltaPct?: number | null }) {
  const v = value ?? 0
  const hasDelta = typeof deltaPct === 'number'
  const color = hasDelta ? (deltaPct! <= 0 ? '#5fcf65' : '#ff7474') : '#aaa'
  const deltaTxt = hasDelta ? `${deltaPct! > 0 ? '▲' : deltaPct! < 0 ? '▼' : ''} ${Math.abs(deltaPct!).toFixed(2)}%` : '—'
  return (
    <div style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>{formatNumber(v)} <span style={{ fontSize: 12 }}>kgCO2e</span></div>
      <div style={{ marginTop: 6, fontSize: 12, color }}>{deltaTxt} vs prev qtr</div>
    </div>
  )
}

function FactorPicker({ factorSetId, label }: { factorSetId?: string, label?: string }) {
  if (!factorSetId) return <div><span style={{ opacity: 0.6 }}>Factor set: default (view-only)</span></div>
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ opacity: 0.8 }}>Factor set</span>
      <select defaultValue={factorSetId}><option value={factorSetId}>{label || 'Default'}</option></select>
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
