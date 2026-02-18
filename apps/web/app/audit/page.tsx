'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON } from '@/lib/api'

type AuditEvent = {
  id: string
  category: 'FACT' | 'COMPLIANCE' | 'FREEZE' | 'SUPPLIER'
  action: string
  at: string
  actor: string | null
  periodStart: string | null
  periodEnd: string | null
  payload: any
}

export default function AuditPage() {
  const [date, setDate] = useState<string>(() => todayISO())
  const [eventType, setEventType] = useState<'ALL' | 'FACT' | 'COMPLIANCE' | 'FREEZE' | 'SUPPLIER'>('ALL')
  const { ps, pe } = useMemo(() => quarterRange(date), [date])

  const q = useQuery({
    queryKey: ['audit-events', ps, pe],
    queryFn: async () => await getJSON<AuditEvent[]>(`/audit/events?periodStart=${ps}&periodEnd=${pe}`)
  })

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Audit Events</h2>
          <small>Facts, compliance, freeze, and supplier approval events.</small>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <label>Quarter start</label>
          <input type="date" value={toQuarterStart(date)} onChange={(e) => setDate(e.target.value)} />
          <select value={eventType} onChange={(e) => setEventType(e.target.value as any)}>
            <option value="ALL">All events</option>
            <option value="FACT">Fact</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="FREEZE">Freeze</option>
            <option value="SUPPLIER">Supplier</option>
          </select>
          <button data-test="audit-export-json" onClick={() => exportJson(ps, pe, eventType, q.data ?? [])}>Export JSON</button>
        </div>
      </header>

      <div data-test="audit-period" style={{ marginBottom: 12, fontSize: 13 }}>
        Period: {ps} → {pe}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #223', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>Time</Th><Th>Category</Th><Th>Action</Th><Th>Actor</Th><Th>Period</Th><Th>Payload</Th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).filter((x) => eventType === 'ALL' || x.category === eventType).map((e) => (
              <tr key={`${e.category}-${e.id}`} style={isFrozenSnapshotEvent(e) ? { background: '#173025' } : undefined}>
                <Td>{new Date(e.at).toLocaleString()}</Td>
                <Td>{e.category}</Td>
                <Td>{e.action}</Td>
                <Td>{e.actor ?? '—'}</Td>
                <Td>{e.periodStart && e.periodEnd ? `${e.periodStart} → ${e.periodEnd}` : '—'}</Td>
                <Td><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.payload)}</pre></Td>
              </tr>
            ))}
            {(!q.data || q.data.length === 0) && (
              <tr><Td colSpan={6} style={{ textAlign: 'center', opacity: 0.7 }}>No events for selected period.</Td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: 'left', padding: 8, background: '#11182f', borderBottom: '1px solid #223' }}>{children}</th> }
function Td({ children, colSpan, style }: { children: React.ReactNode; colSpan?: number; style?: React.CSSProperties }) { return <td colSpan={colSpan} style={{ padding: 8, borderBottom: '1px solid #223', verticalAlign: 'top', ...(style || {}) }}>{children}</td> }
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function todayISO() { return iso(new Date()) }
function toQuarterStart(s: string) { const d = new Date(s); const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); return iso(qs) }
function quarterRange(date: string) { const d = new Date(date); const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0); return { ps: iso(qs), pe: iso(qe) } }

function isFrozenSnapshotEvent(event: AuditEvent) {
  return event.category === 'FREEZE' || String(event.action).toUpperCase().includes('FREEZE');
}

function exportJson(ps: string, pe: string, eventType: string, rows: AuditEvent[]) {
  const filtered = rows.filter((x) => eventType === 'ALL' || x.category === eventType);
  const payload = { periodStart: ps, periodEnd: pe, eventType, generatedAt: new Date().toISOString(), events: filtered };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-events-${ps}-${pe}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
