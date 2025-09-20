'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { gql } from '@/lib/api'

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
  // ——— state
  const [entityId, setEntityId] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('entityId') : null) || '')
  const [date, setDate] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || todayISO())
  const factorSetId = process.env.NEXT_PUBLIC_DEFAULT_FACTOR_SET_ID
  const factorLabel = process.env.NEXT_PUBLIC_FACTOR_SET_LABEL || 'Default'

  const qc = useQueryClient()

  // derive quarter start/end from date
  const { ps, pe, prevPs, prevPe } = useMemo(() => {
    const d = new Date(date)
    const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
    const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0)
    const pqs = new Date(qs.getFullYear(), qs.getMonth() - 3, 1)
    const pqe = new Date(pqs.getFullYear(), pqs.getMonth() + 3, 0)
    return {
      ps: iso(qs), pe: iso(qe),
      prevPs: iso(pqs), prevPe: iso(pqe),
    }
  }, [date])

  useEffect(() => { localStorage.setItem('entityId', entityId) }, [entityId])
  useEffect(() => { localStorage.setItem('qstart', date) }, [date])

  // ——— queries
  const cur = useQuery({
    queryKey: ['totals', entityId, ps, pe],
    enabled: !!entityId,
    queryFn: async () => {
      const data = await gql<{ getTotals: Totals | null }>(GET_TOTALS, { entityId, periodStart: ps, periodEnd: pe })
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

  // YoY deltas
  const deltas = useMemo(() => {
    if (!cur.data || !prev.data) return null
    const pct = (c: number | null, p: number | null) =>
      (c == null || p == null || p === 0) ? null : round(((c - p) / p) * 100, 2)
    return {
      s1: pct(cur.data.scope1, prev.data.scope1),
      s2l: pct(cur.data.scope2_loc, prev.data.scope2_loc),
      s2m: pct(cur.data.scope2_mkt, prev.data.scope2_mkt),
      s3: pct(cur.data.scope3, prev.data.scope3),
    }
  }, [cur.data, prev.data])

  // ——— recalc
  const [notice, setNotice] = useState<string | null>(null)
  const recalc = useMutation({
    mutationFn: async () => {
      if (!factorSetId) return false
      await gql<{ recalc: boolean }>(RECALC, { entityId, periodStart: ps, periodEnd: pe, factorSetId })
      return true
    },
    onSuccess: async () => {
      setNotice('Recalculation enqueued… updating data')
      // light polling up to ~30s
      const started = Date.now()
      const poll = async () => {
        await qc.invalidateQueries({ queryKey: ['totals', entityId, ps, pe] })
        setTimeout(() => {
          if (Date.now() - started > 30000) {
            setNotice('Still processing in the background. Totals will refresh soon.')
            return
          }
          // If totals changed, clear notice (we don’t have a checksum; we just refresh once)
          setNotice(null)
        }, 1200)
      }
      poll()
    },
    onError: (e: any) => setNotice(e?.message || 'Failed to enqueue recalculation')
  })

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Emissions Explorer</h2>
          <small style={{ opacity: 0.8 }}>Pick entity and quarter to view Scope 1 / 2 (loc & mkt) / 3.</small>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <FactorPicker factorSetId={factorSetId} label={factorLabel} />
          {factorSetId && (
            <button
              onClick={() => recalc.mutate()}
              disabled={!entityId || recalc.isPending}
              title="Recalculate totals for this quarter with the selected factor set"
            >
              {recalc.isPending ? 'Recalculating…' : 'Recalculate'}
            </button>
          )}
        </div>
      </header>

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
          <div style={{ padding: 8, border: '1px solid #233', borderRadius: 8 }}>{ps} → {pe}</div>
        </div>
        <div>
          <label>Prev. quarter</label>
          <div style={{ padding: 8, border: '1px solid #233', borderRadius: 8 }}>{prevPs} → {prevPe}</div>
        </div>
      </div>

      {notice && (
        <div data-test="recalc-notice" style={{ margin: '10px 0 16px', padding: 10, border: '1px solid #335', borderRadius: 8, background: '#0f1630' }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px,1fr))', gap: 12, marginTop: 8 }}>
        <Card title="Scope 1" value={cur.data?.scope1} deltaPct={deltas?.s1} />
        <Card title="Scope 2 (loc)" value={cur.data?.scope2_loc} deltaPct={deltas?.s2l} />
        <Card title="Scope 2 (mkt)" value={cur.data?.scope2_mkt} deltaPct={deltas?.s2m} />
        <Card title="Scope 3" value={cur.data?.scope3} deltaPct={deltas?.s3} />
      </div>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.8 }}>
        Data reflects the tenant’s default factor set for display. Recalculate uses the selected factor set (if configured).
      </div>
    </div>
  )
}

/* ------- components & utils ------- */

function Card({ title, value, deltaPct }: { title: string, value: number | null | undefined, deltaPct?: number | null }) {
  const v = value ?? 0
  const hasDelta = typeof deltaPct === 'number'
  const color = hasDelta ? (deltaPct! <= 0 ? '#5fcf65' : '#ff7474') : '#aaa'
  const deltaTxt = hasDelta ? `${deltaPct! > 0 ? '▲' : deltaPct! < 0 ? '▼' : ''} ${Math.abs(deltaPct!).toFixed(2)}%` : '—'
  return (
    <div style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>{formatNumber(v)} <span style={{ fontSize: 12 }}>kgCO₂e</span></div>
      <div style={{ marginTop: 6, fontSize: 12, color }}>{deltaTxt} vs prev qtr</div>
    </div>
  )
}

function FactorPicker({ factorSetId, label }: { factorSetId?: string, label?: string }) {
  if (!factorSetId) {
    return <div title="Set NEXT_PUBLIC_DEFAULT_FACTOR_SET_ID to enable recalculation"><span style={{ opacity: 0.6 }}>Factor set: default (view-only)</span></div>
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ opacity: 0.8 }}>Factor set</span>
      <select defaultValue={factorSetId} onChange={(e) => {/* reserved for future; single option for now */}}>
        <option value={factorSetId}>{label || 'Default'}</option>
      </select>
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


