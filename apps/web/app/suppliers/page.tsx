'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getJSON, postJSON } from '@/lib/api'
import SupplierInviteModal from '@/components/SupplierInviteModal'
import ReportContextBanner from '@/components/ReportContextBanner'
import { useReportContext } from '../report-context'
import { ReportMeta } from '@/lib/reportMeta'
import { getClientRole } from '@/lib/role'

type ByCat = { category: string; suppliers: number; spend: number; emissions_kgco2e: number }
type Coverage = {
  invited: number
  responded: number
  spendTotal: number
  spendCovered: number
  coveragePercent: number
  coverageByCountPercent: number
  byCategory: ByCat[]
}

type SupplierResponseRow = {
  id: string
  supplierId: string
  supplierName: string
  supplierEmail: string
  category: string
  periodStart: string
  periodEnd: string
  emissionsKgCO2e: number | null
  approved: boolean
  dataQualityTier: 'PRIMARY' | 'SECONDARY' | 'ESTIMATED'
  submittedAt: string
}

export default function SuppliersPage() {
  const qc = useQueryClient()
  const { reportId } = useReportContext()
  const role = getClientRole()
  const isAuditor = role === 'AUDITOR'
  const canApproveSupplier = role === 'ADMIN'
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || todayISO())
  const { ps, pe } = useMemo(() => quarterRange(date), [date])
  const [forcedPeriod] = useState(() => {
    if (typeof window === 'undefined') return { periodStart: null as string | null, periodEnd: null as string | null }
    const params = new URLSearchParams(window.location.search)
    return { periodStart: params.get('periodStart'), periodEnd: params.get('periodEnd') }
  })
  const qsPeriodStart = forcedPeriod.periodStart
  const qsPeriodEnd = forcedPeriod.periodEnd
  const forcedPeriodEnabled = !!qsPeriodStart && !!qsPeriodEnd

  const reportMeta = useQuery({
    queryKey: ['report-meta', reportId],
    enabled: !!reportId && !forcedPeriodEnabled,
    queryFn: async () => await getJSON<ReportMeta>(`/reports/${reportId}`)
  })
  const byPeriodMeta = useQuery({
    queryKey: ['report-meta-by-period', ps, pe, reportId],
    enabled: !reportId && !forcedPeriodEnabled,
    queryFn: async () => await getJSON<ReportMeta | null>(`/reports/by-period?periodStart=${ps}&periodEnd=${pe}`)
  })
  const activeMeta = reportId ? reportMeta.data : byPeriodMeta.data
  const activePs = qsPeriodStart ?? activeMeta?.periodStart ?? ps
  const activePe = qsPeriodEnd ?? activeMeta?.periodEnd ?? pe
  const isLocked = !!activeMeta?.isLocked

  const q = useQuery({
    queryKey: ['suppliers-coverage', activePs, activePe],
    queryFn: async () => await getJSON<Coverage>(`/suppliers/coverage?periodStart=${activePs}&periodEnd=${activePe}`)
  })

  const responses = useQuery({
    queryKey: ['suppliers-responses', activePs, activePe],
    queryFn: async () => await getJSON<SupplierResponseRow[]>(`/suppliers/responses?periodStart=${activePs}&periodEnd=${activePe}`)
  })

  const approve = useMutation({
    mutationFn: async (responseId: string) => await postJSON<{ ok: boolean }>('/suppliers/responses/approve', { responseId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['suppliers-coverage', activePs, activePe] })
      await qc.invalidateQueries({ queryKey: ['suppliers-responses', activePs, activePe] })
      await qc.invalidateQueries({ queryKey: ['exec-kpis'] })
    }
  })

  const cov = q.data

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Suppliers (Scope 3)</h2>
          <small>Invite suppliers, collect submissions, approve, and fold into Scope 3.</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div>
            <label>Quarter start</label>
            <input type="date" value={toQuarterStart(date)} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>Period</label>
            <div style={{ padding: 8, border: '1px solid #233', borderRadius: 8 }}>{activePs} → {activePe}</div>
          </div>
          <button onClick={() => setOpen(true)} disabled={isLocked || isAuditor} title={isLocked ? 'Report is frozen. Unlocking requires creating a new report version.' : isAuditor ? 'Insufficient permissions.' : ''}>
            Invite suppliers
          </button>
        </div>
      </header>

      <ReportContextBanner meta={activeMeta} />
      {isAuditor && (
        <div data-test="auditor-readonly-banner" style={{ margin: '0 0 12px', padding: 10, border: '1px solid #463', borderRadius: 8, background: '#1f1a12' }}>
          Auditor View (Read-only)
        </div>
      )}

      <section style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px,1fr))', gap: 12 }}>
        <Card testId="supplier-invited-count" label="Invited" value={cov?.invited ?? 0} />
        <Card testId="supplier-responded-count" label="Responded" value={cov?.responded ?? 0} />
        <Card testId="supplier-coverage-count" label="Coverage by count" value={`${(cov?.coverageByCountPercent ?? 0).toFixed(2)}%`} />
        <Card testId="supplier-coverage-spend" label="Coverage by spend" value={`${(cov?.coveragePercent ?? 0).toFixed(2)}%`} />
      </section>

      <section style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Responses</h3>
        <div style={{ overflowX: 'auto', border: '1px solid #223', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Category</Th>
                <Th>Emissions (kgCO₂e)</Th>
                <Th>Quality Tier</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {(responses.data ?? []).map((r) => (
                <tr key={r.id}>
                  <Td>{r.supplierName}</Td>
                  <Td>{r.category}</Td>
                  <Td>{r.emissionsKgCO2e == null ? '—' : fmt(r.emissionsKgCO2e)}</Td>
                  <Td>{r.dataQualityTier}</Td>
                  <Td>{new Date(r.submittedAt).toLocaleString()}</Td>
                  <Td>{r.approved ? 'Approved' : 'Pending'}</Td>
                  <Td>
                    <button
                      data-test={`approve-supplier-${r.id}`}
                      onClick={() => approve.mutate(r.id)}
                      disabled={r.approved || isLocked || approve.isPending || !canApproveSupplier}
                      title={isLocked ? 'Report is frozen. Unlocking requires creating a new report version.' : !canApproveSupplier ? 'Insufficient permissions.' : ''}
                    >
                      {r.approved ? 'Approved' : 'Approve'}
                    </button>
                  </Td>
                </tr>
              ))}
              {(!responses.data || responses.data.length === 0) && (
                <tr>
                  <Td colSpan={7} style={{ textAlign: 'center', padding: 12, opacity: 0.7 }}>No responses yet.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>By Category</h3>
        <div style={{ overflowX: 'auto', border: '1px solid #223', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>Category</Th><Th>Responded suppliers</Th><Th>Spend</Th><Th>Reported Emissions</Th></tr></thead>
            <tbody>
              {(cov?.byCategory ?? []).map((r) => (
                <tr key={r.category}>
                  <Td>{r.category}</Td>
                  <Td>{r.suppliers}</Td>
                  <Td>{fmt(r.spend)}</Td>
                  <Td>{fmt(r.emissions_kgco2e)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && <SupplierInviteModal periodStart={activePs} periodEnd={activePe} onClose={() => setOpen(false)} />}
    </div>
  )
}

function Card({ label, value, testId }: { label: string; value: number | string; testId: string }) {
  return <Box><div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div><div data-test={testId} style={{ fontSize: 24, fontWeight: 600 }}>{value}</div></Box>
}
function Box({ children }: { children: React.ReactNode }) {
  return <div style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>{children}</div>
}
function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: 'left', padding: 8, background: '#11182f', borderBottom: '1px solid #223' }}>{children}</th> }
function Td({ children, colSpan, style }: { children: React.ReactNode; colSpan?: number; style?: React.CSSProperties }) { return <td colSpan={colSpan} style={{ padding: 8, borderBottom: '1px solid #223', ...(style || {}) }}>{children}</td> }
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function todayISO() { return iso(new Date()) }
function toQuarterStart(s: string) { const d = new Date(s); const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); return iso(qs) }
function quarterRange(date: string) { const d = new Date(date); const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0); return { ps: iso(qs), pe: iso(qe) } }
function fmt(n: number) { try { return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n) } catch { return String(n) } }
