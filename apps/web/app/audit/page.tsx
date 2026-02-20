'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableShell, PageHeader, SectionCard } from '@/components/product'

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
    <div className="space-y-4">
      <PageHeader
        title="Audit Events"
        description="Facts, compliance, freeze, and supplier approval events for the selected quarter."
        right={(
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Quarter start</label>
              <Input type="date" value={toQuarterStart(date)} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Select value={eventType} onValueChange={(value) => setEventType(value as any)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All events</SelectItem>
                <SelectItem value="FACT">Fact</SelectItem>
                <SelectItem value="COMPLIANCE">Compliance</SelectItem>
                <SelectItem value="FREEZE">Freeze</SelectItem>
                <SelectItem value="SUPPLIER">Supplier</SelectItem>
              </SelectContent>
            </Select>
            <Button data-test="audit-export-json" variant="outline" onClick={() => exportJson(ps, pe, eventType, q.data ?? [])}>
              Export JSON
            </Button>
          </div>
        )}
      />

      <SectionCard title="Events">
        <div data-test="audit-period" className="mb-3 text-sm text-muted-foreground">
          Period: {ps} → {pe}
        </div>
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).filter((x) => eventType === 'ALL' || x.category === eventType).map((e) => (
                <TableRow key={`${e.category}-${e.id}`} className={isFrozenSnapshotEvent(e) ? 'bg-success/10' : undefined}>
                  <TableCell>{new Date(e.at).toLocaleString()}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell>{e.action}</TableCell>
                  <TableCell>{e.actor ?? '—'}</TableCell>
                  <TableCell>{e.periodStart && e.periodEnd ? `${e.periodStart} → ${e.periodEnd}` : '—'}</TableCell>
                  <TableCell>
                    <pre className="max-w-[420px] whitespace-pre-wrap break-all text-xs">{JSON.stringify(e.payload)}</pre>
                  </TableCell>
                </TableRow>
              ))}
              {(!q.data || q.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No events for selected period.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>
    </div>
  )
}
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
