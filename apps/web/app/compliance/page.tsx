'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gql } from '@/lib/api'
import EvidenceAttachModal from '@/components/EvidenceAttachModal'
import ComplianceExplainModal from '@/components/ComplianceExplainModal'

type Finding = {
  id: string
  ruleCode: string
  status: 'PASS'|'FAIL'|'RISK'
  severity: number
  reason: string
  evidenceUrl?: string | null
  owner?: string | null
  dueDate?: string | null
}

const GAPMAP = `
query G($periodStart:String!, $periodEnd:String!){
  gapMap(periodStart:$periodStart, periodEnd:$periodEnd){
    id ruleCode status severity reason evidenceUrl owner dueDate
  }
}`

const RESOLVE = `
mutation R($id:ID!, $url:String!){ resolveGap(id:$id, evidenceUrl:$url) }
`

export default function CompliancePage() {
  const qc = useQueryClient()
  const [date, setDate] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || todayISO())
  const { ps, pe } = useMemo(() => quarterRange(date), [date])

  const [statusFilter, setStatusFilter] = useState<'ALL'|'FAIL'|'RISK'|'PASS'>('ALL')
  const [search, setSearch] = useState('')

  const q = useQuery({
    queryKey: ['gapMap', ps, pe],
    queryFn: async () => (await gql<{gapMap: Finding[]}>(GAPMAP, { periodStart: ps, periodEnd: pe })).gapMap
  })

  const [modalFor, setModalFor] = useState<Finding | null>(null)
  const [explainFor, setExplainFor] = useState<Finding | null>(null)
  const resolveGap = useMutation({
    mutationFn: async ({ id, evidenceUrl }: { id: string; evidenceUrl: string }) =>
      (await gql<{ resolveGap: boolean }>(RESOLVE, { id, url: evidenceUrl })).resolveGap,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gapMap', ps, pe] })
  })

  // completeness
  const completeness = useMemo(() => {
    const rows = q.data ?? []
    const total = rows.length
    const pass = rows.filter(r => r.status === 'PASS').length
    const pct = total ? Math.round((pass / total) * 100) : 0
    return { total, pass, pct }
  }, [q.data])

  const rows = useMemo(() => {
    let r = (q.data ?? []).slice()
    if (statusFilter !== 'ALL') r = r.filter(x => x.status === statusFilter)
    if (search) {
      const s = search.toLowerCase()
      r = r.filter(x => x.ruleCode.toLowerCase().includes(s) || (x.reason || '').toLowerCase().includes(s))
    }
    // sort FAIL/RISK first, then severity desc
    r.sort((a, b) => {
      const sA = a.status === 'PASS' ? 1 : 0
      const sB = b.status === 'PASS' ? 1 : 0
      if (sA !== sB) return sA - sB
      return b.severity - a.severity
    })
    return r
  }, [q.data, statusFilter, search])

  return (
    <div>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Compliance — Gap Map</h2>
          <small>Attach evidence to flip failing rules to PASS.</small>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div>
            <label>Quarter start</label>
            <input type="date" value={toQuarterStart(date)} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label>Period</label>
            <div style={{ padding: 8, border: '1px solid #233', borderRadius: 8 }}>{ps} → {pe}</div>
          </div>
        </div>
      </header>

      <ProgressBar percent={completeness.pct} text={`${completeness.pass}/${completeness.total} PASS`} />

      <div style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="ALL">All statuses</option>
          <option value="FAIL">FAIL</option>
          <option value="RISK">RISK</option>
          <option value="PASS">PASS</option>
        </select>
        <input placeholder="Search rule or reason…" value={search} onChange={e => setSearch(e.target.value)} />
        <button onClick={() => qc.invalidateQueries({ queryKey: ['gapMap', ps, pe] })}>Refresh</button>
      </div>

      <div style={{ overflowX:'auto', border:'1px solid #223', borderRadius:8 }}>
        <table data-test="gap-table" style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>Rule</Th>
              <Th>Severity</Th>
              <Th>Reason</Th>
              <Th>Evidence</Th>
              <Th>Owner</Th>
              <Th>Due</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(rows).map(row => (
              <tr key={row.id}>
                <Td><StatusBadge status={row.status} /></Td>
                <Td><code>{row.ruleCode}</code></Td>
                <Td>{row.severity}</Td>
                <Td style={{ maxWidth: 420 }}>{row.reason}</Td>
                <Td style={{ maxWidth: 280, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {row.evidenceUrl ? <a href={row.evidenceUrl} target="_blank" rel="noreferrer">{row.evidenceUrl}</a> : '—'}
                </Td>
                <Td>{row.owner ?? '—'}</Td>
                <Td>{row.dueDate ?? '—'}</Td>
                <Td>
                  {row.status !== 'PASS' && (
                    <>
                      <button onClick={() => setModalFor(row)}>Attach evidence</button>
                      <button onClick={() => setExplainFor(row)} style={{ marginLeft: 6 }}>Explain</button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><Td colSpan={8} style={{ textAlign:'center', padding:16, opacity:0.7 }}>No findings for {ps} → {pe} (or evaluation pending).</Td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalFor && (
        <EvidenceAttachModal
          onClose={() => setModalFor(null)}
          onDone={(evidenceUrl) => {
            setModalFor(null)
            resolveGap.mutate({ id: modalFor.id, evidenceUrl })
          }}
        />
      )}

      {explainFor && (
        <ComplianceExplainModal
          finding={explainFor}
          period={{ ps, pe }}
          onClose={() => setExplainFor(null)}
        />
      )}
    </div>
  )
}

/* ——— UI bits ——— */

function ProgressBar({ percent, text }: { percent: number; text?: string }) {
  const p = Math.max(0, Math.min(100, percent || 0))
  return (
    <div style={{ margin: '12px 0 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
        <span>Completeness</span>
        <span>{text ?? `${p}%`}</span>
      </div>
      <div data-test="completeness-bar" style={{ height:10, background:'#11182f', borderRadius:20, overflow:'hidden', border:'1px solid #223' }}>
        <div style={{ width: `${p}%`, height:'100%', background:'#27c084' }} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Finding['status'] }) {
  const map: Record<string, { bg: string; fg: string }> = {
    FAIL: { bg: '#3a0b0b', fg: '#ff7d7d' },
    RISK: { bg: '#332a00', fg: '#ffd36e' },
    PASS: { bg: '#0d2f21', fg: '#7be3b6' }
  }
  const s = map[status]
  return <span style={{ padding:'2px 8px', borderRadius:999, background:s.bg, color:s.fg, fontSize:12 }}>{status}</span>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: 8, background: '#11182f', borderBottom: '1px solid #223' }}>{children}</th>
}
function Td({ children, colSpan, style }: { children: React.ReactNode; colSpan?: number; style?: React.CSSProperties }) {
  return <td colSpan={colSpan} style={{ padding: 8, borderBottom: '1px solid #223', verticalAlign:'top', ...(style||{}) }}>{children}</td>
}

/* ——— utils ——— */
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function todayISO() { return iso(new Date()) }
function quarterRange(date: string) {
  const d = new Date(date)
  const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
  const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0)
  return { ps: iso(qs), pe: iso(qe) }
}
function toQuarterStart(s: string) {
  const d = new Date(s)
  const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
  return iso(qs)
}


