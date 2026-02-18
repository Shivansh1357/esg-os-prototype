'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON } from '@/lib/api'
import { getClientRole } from '@/lib/role'

type PilotTenantRow = {
  tenantId: string | null
  tenantName: string | null
  timeToFirstFact: string | null
  timeToFirstFreeze: string | null
  timeToFirstExecView: string | null
  supplierInviteCount: number
  freezeCompleted: boolean
  lastActivityAt: string | null
  timeToFirstReportSeconds: number | null
  feedbackCount: number
}

type PilotStats = {
  tenants: PilotTenantRow[]
  summary: {
    avgTimeToFirstReportSeconds: number | null
    freezeReachPercent: number
    supplierInviteReachPercent: number
    avgFeedbackRating: number | null
  }
}

type FeedbackItem = {
  id: string
  userId: string | null
  role: string
  page: string
  message: string
  rating: number
  createdAt: string
}

export default function PilotPage() {
  const role = getClientRole()
  const [minRating, setMinRating] = useState(1)
  const [pageLike, setPageLike] = useState('')

  const stats = useQuery({
    queryKey: ['pilot-stats'],
    queryFn: async () => await getJSON<PilotStats>('/pilot/stats')
  })

  const feedback = useQuery({
    queryKey: ['pilot-feedback', minRating, pageLike],
    queryFn: async () =>
      await getJSON<FeedbackItem[]>(`/feedback?limit=20&minRating=${minRating}&pageLike=${encodeURIComponent(pageLike)}`)
  })

  const rows = stats.data?.tenants ?? []
  const summary = stats.data?.summary

  const avgTtf = useMemo(() => formatDuration(summary?.avgTimeToFirstReportSeconds ?? null), [summary?.avgTimeToFirstReportSeconds])

  if (role !== 'ADMIN') {
    return (
      <div>
        <h2 style={{ fontSize: 18 }}>Pilot Dashboard</h2>
        <p>Insufficient permissions.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Pilot Dashboard</h2>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px,1fr))', gap: 10 }}>
        <Card title="Avg Time to First Report" value={avgTtf} testId="pilot-summary-ttf" />
        <Card title="% Tenants Reaching Freeze" value={`${(summary?.freezeReachPercent ?? 0).toFixed(2)}%`} testId="pilot-summary-freeze" />
        <Card title="% Tenants Inviting Suppliers" value={`${(summary?.supplierInviteReachPercent ?? 0).toFixed(2)}%`} testId="pilot-summary-supplier" />
        <Card title="Avg Feedback Rating" value={summary?.avgFeedbackRating == null ? 'N/A' : summary.avgFeedbackRating.toFixed(2)} testId="pilot-summary-rating" />
      </section>

      <section style={{ marginTop: 14, border: '1px solid #223', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th>First Fact</Th>
              <Th>First Freeze</Th>
              <Th>First Exec View</Th>
              <Th>Supplier Invites</Th>
              <Th>Freeze</Th>
              <Th>Last Activity</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenantId ?? 'tenant'}>
                <Td>{r.tenantName || r.tenantId || 'N/A'}</Td>
                <Td>{fmtTs(r.timeToFirstFact)}</Td>
                <Td>{fmtTs(r.timeToFirstFreeze)}</Td>
                <Td>{fmtTs(r.timeToFirstExecView)}</Td>
                <Td>{r.supplierInviteCount}</Td>
                <Td>{r.freezeCompleted ? 'Done' : 'Pending'}</Td>
                <Td>{fmtTs(r.lastActivityAt)}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><Td colSpan={7} style={{ textAlign: 'center' }}>No pilot metrics yet.</Td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Feedback Stream</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
              <option value={1}>Rating {'>='} 1</option>
              <option value={2}>Rating {'>='} 2</option>
              <option value={3}>Rating {'>='} 3</option>
              <option value={4}>Rating {'>='} 4</option>
              <option value={5}>Rating {'>='} 5</option>
            </select>
            <input value={pageLike} onChange={(e) => setPageLike(e.target.value)} placeholder="Filter page..." />
          </div>
        </div>
        <div style={{ border: '1px solid #223', borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><Th>Time</Th><Th>Role</Th><Th>Page</Th><Th>Rating</Th><Th>Message</Th></tr>
            </thead>
            <tbody>
              {(feedback.data ?? []).map((f) => (
                <tr key={f.id}>
                  <Td>{fmtTs(f.createdAt)}</Td>
                  <Td>{f.role}</Td>
                  <Td>{f.page}</Td>
                  <Td>{f.rating}</Td>
                  <Td>{f.message}</Td>
                </tr>
              ))}
              {(feedback.data ?? []).length === 0 && (
                <tr><Td colSpan={5} style={{ textAlign: 'center' }}>No feedback yet.</Td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Card({ title, value, testId }: { title: string; value: string; testId: string }) {
  return (
    <div style={{ border: '1px solid #223', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }} data-test={testId}>{value}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: 8, background: '#11182f', borderBottom: '1px solid #223' }}>{children}</th>
}
function Td({ children, colSpan, style }: { children: React.ReactNode; colSpan?: number; style?: React.CSSProperties }) {
  return <td colSpan={colSpan} style={{ padding: 8, borderBottom: '1px solid #223', ...(style || {}) }}>{children}</td>
}

function fmtTs(v: string | null) {
  if (!v) return 'N/A'
  return new Date(v).toLocaleString()
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return 'N/A'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return `${hours}h ${rem}m`
}
