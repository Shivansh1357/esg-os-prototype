'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getJSON, gql } from '@/lib/api'
import EvidenceAttachModal from '@/components/EvidenceAttachModal'
import ComplianceExplainModal from '@/components/ComplianceExplainModal'
import { ReportMeta } from '@/lib/reportMeta'
import { useReportContext } from '../report-context'
import ReportContextBanner from '@/components/ReportContextBanner'
import { getClientRole } from '@/lib/role'
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
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  DataTableShell,
  PageHeader,
  SectionCard,
  StatusBanner,
} from '@/components/product'

type Finding = {
  id: string
  ruleCode: string
  status: 'PASS' | 'FAIL' | 'RISK'
  severity: number
  reason: string
  evidenceUrl?: string | null
  owner?: string | null
  dueDate?: string | null
  principle?: string | null
  brsrSection?: string | null
  description?: string | null
  framework?: string | null
}

const FRAMEWORK_OPTIONS = [
  { value: 'ALL', label: 'All frameworks' },
  { value: 'BRSR_CORE', label: 'BRSR (India)' },
  { value: 'GRI_2021', label: 'GRI Standards 2021' },
  { value: 'CDP_CLIMATE', label: 'CDP Climate 2024' },
  { value: 'ISSB_2023', label: 'ISSB (IFRS S1/S2)' },
]

const PRINCIPLE_LABELS: Record<string, string> = {
  P1: 'P1 — Ethics, Transparency & Accountability',
  P2: 'P2 — Sustainable & Safe Products',
  P3: 'P3 — Employee Well-being',
  P4: 'P4 — Stakeholder Engagement',
  P5: 'P5 — Human Rights',
  P6: 'P6 — Environmental Protection',
  P7: 'P7 — Responsible Policy Advocacy',
  P8: 'P8 — Inclusive Growth',
  P9: 'P9 — Consumer Responsibility',
}

const GAPMAP = `
query G($periodStart:String!, $periodEnd:String!, $framework:String){
  gapMap(periodStart:$periodStart, periodEnd:$periodEnd, framework:$framework){
    id ruleCode status severity reason evidenceUrl owner dueDate principle brsrSection description framework
  }
}`

const RESOLVE = `
mutation R($id:ID!, $url:String!){ resolveGap(id:$id, evidenceUrl:$url) }
`

export default function CompliancePage() {
  const { reportId } = useReportContext()
  const role = getClientRole()
  const isAuditor = role === 'AUDITOR'
  const canResolve = role === 'ADMIN' || role === 'MEMBER'
  const qc = useQueryClient()
  const [date, setDate] = useState<string>(todayISO)

  useEffect(() => {
    const stored = localStorage.getItem('qstart')
    if (stored) setDate(stored)
  }, [])
  const { ps, pe } = useMemo(() => quarterRange(date), [date])

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

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FAIL' | 'RISK' | 'PASS'>('ALL')
  const [principleFilter, setPrincipleFilter] = useState<string>('ALL')
  const [frameworkFilter, setFrameworkFilter] = useState<string>('ALL')
  const [search, setSearch] = useState('')

  const q = useQuery({
    queryKey: ['gapMap', periodStart, periodEnd, frameworkFilter],
    enabled: !isFrozenPeriod,
    queryFn: async () => (await gql<{ gapMap: Finding[] }>(GAPMAP, {
      periodStart,
      periodEnd,
      framework: frameworkFilter === 'ALL' ? null : frameworkFilter
    })).gapMap
  })

  const snapshotRows = useMemo(() => ((activeReport?.complianceSnapshot as Finding[] | null) ?? []), [activeReport?.complianceSnapshot])

  const [modalFor, setModalFor] = useState<Finding | null>(null)
  const [explainFor, setExplainFor] = useState<Finding | null>(null)
  const resolveGap = useMutation({
    mutationFn: async ({ id, evidenceUrl }: { id: string; evidenceUrl: string }) =>
      (await gql<{ resolveGap: boolean }>(RESOLVE, { id, url: evidenceUrl })).resolveGap,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gapMap', periodStart, periodEnd] })
  })

  const completeness = useMemo(() => {
    const rows = isFrozenPeriod ? snapshotRows : (q.data ?? [])
    const total = rows.length
    const pass = rows.filter(r => r.status === 'PASS').length
    const pct = total ? Math.round((pass / total) * 100) : 0
    return { total, pass, pct: activeReport?.completenessPercent ?? pct }
  }, [q.data, isFrozenPeriod, snapshotRows, activeReport?.completenessPercent])

  const rows = useMemo(() => {
    let results = (isFrozenPeriod ? snapshotRows : (q.data ?? [])).slice()
    if (statusFilter !== 'ALL') results = results.filter(x => x.status === statusFilter)
    if (principleFilter !== 'ALL') results = results.filter(x => x.principle === principleFilter)
    if (search) {
      const s = search.toLowerCase()
      results = results.filter(x => x.ruleCode.toLowerCase().includes(s) || (x.reason || '').toLowerCase().includes(s) || (x.description || '').toLowerCase().includes(s))
    }
    results.sort((a, b) => {
      const pA = a.principle || 'Z'
      const pB = b.principle || 'Z'
      if (pA !== pB) return pA.localeCompare(pB)
      const passA = a.status === 'PASS' ? 1 : 0
      const passB = b.status === 'PASS' ? 1 : 0
      if (passA !== passB) return passA - passB
      return b.severity - a.severity
    })
    return results
  }, [q.data, statusFilter, principleFilter, search, isFrozenPeriod, snapshotRows])

  const principleStats = useMemo(() => {
    const allRows = isFrozenPeriod ? snapshotRows : (q.data ?? [])
    const stats: Record<string, { total: number; pass: number }> = {}
    for (const row of allRows) {
      const p = row.principle || 'Other'
      if (!stats[p]) stats[p] = { total: 0, pass: 0 }
      stats[p].total++
      if (row.status === 'PASS') stats[p].pass++
    }
    return stats
  }, [q.data, isFrozenPeriod, snapshotRows])

  return (
    <div className="space-y-4">
      <ReportContextBanner meta={activeReport} />
      <PageHeader
        title="Compliance - Gap Map"
        description="Track unresolved rules, attach evidence, and move findings to PASS."
        right={(
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Quarter start</label>
              <Input type="date" value={toQuarterStart(date)} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Period</label>
              <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                {periodStart} → {periodEnd}
              </div>
            </div>
          </div>
        )}
      />

      <ProgressBar percent={completeness.pct} text={`${completeness.pass}/${completeness.total} PASS`} />

      {Object.keys(principleStats).length > 1 && (
        <SectionCard title="NGRBC Principles">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(principleStats).sort(([a],[b]) => a.localeCompare(b)).map(([p, s]) => {
              const pct = s.total ? Math.round((s.pass / s.total) * 100) : 0
              return (
                <button
                  key={p}
                  onClick={() => setPrincipleFilter(principleFilter === p ? 'ALL' : p)}
                  className={`rounded-lg border p-2 text-left text-xs transition-colors ${principleFilter === p ? 'border-primary bg-primary/10' : 'border-border/70 hover:bg-muted/30'}`}
                  data-test={`principle-${p}`}
                >
                  <div className="font-semibold">{PRINCIPLE_LABELS[p] ?? p}</div>
                  <div className="mt-1 text-muted-foreground">{s.pass}/{s.total} PASS ({pct}%)</div>
                  <Progress value={pct} className="mt-1 h-1.5" />
                </button>
              )
            })}
          </div>
        </SectionCard>
      )}
      {isFrozenPeriod && (
        <StatusBanner tone="success" testId="frozen-snapshot-label">
          Frozen Snapshot - showing report compliance snapshot.
        </StatusBanner>
      )}
      {isAuditor && (
        <StatusBanner tone="warning" testId="auditor-readonly-banner">
          Auditor View (Read-only)
        </StatusBanner>
      )}

      <SectionCard title="Findings">
        <div className="mb-3 grid gap-2 md:grid-cols-[160px_160px_160px_1fr_auto]">
          <Select value={statusFilter} onValueChange={value => setStatusFilter(value as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="FAIL">FAIL</SelectItem>
              <SelectItem value="RISK">RISK</SelectItem>
              <SelectItem value="PASS">PASS</SelectItem>
            </SelectContent>
          </Select>
          <Select value={principleFilter} onValueChange={value => setPrincipleFilter(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All principles</SelectItem>
              {Object.entries(PRINCIPLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={frameworkFilter} onValueChange={value => setFrameworkFilter(value)}>
            <SelectTrigger data-test="framework-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRAMEWORK_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Search rule, reason, or description..." value={search} onChange={e => setSearch(e.target.value)} />
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ['gapMap', periodStart, periodEnd] })}
            disabled={isFrozenPeriod || isAuditor}
            title={isFrozenPeriod ? 'Report is frozen. Unlocking requires creating a new report version.' : isAuditor ? 'Insufficient permissions.' : ''}
          >
            Refresh
          </Button>
        </div>

        <DataTableShell>
          <Table data-test="gap-table">
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Principle</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>
                    <span className="text-xs font-medium">{row.principle ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{row.ruleCode}</code>
                    {row.description && <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>}
                  </TableCell>
                  <TableCell>{row.severity}</TableCell>
                  <TableCell className="max-w-[360px]">{row.reason}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.evidenceUrl ? <a href={row.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary underline">View</a> : '—'}
                  </TableCell>
                  <TableCell>
                    {row.status !== 'PASS' && (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          data-test="resolve-gap-btn"
                          onClick={() => setModalFor(row)}
                          disabled={isFrozenPeriod || !canResolve}
                          title={isFrozenPeriod ? 'Report is frozen.' : !canResolve ? 'Insufficient permissions.' : ''}
                        >
                          Attach
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setExplainFor(row)}>Explain</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    No findings for {periodStart} → {periodEnd}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>

      {modalFor && (
        <EvidenceAttachModal
          onClose={() => setModalFor(null)}
          onDone={(evidenceUrl) => {
            setModalFor(null)
            resolveGap.mutate({ id: modalFor.id, evidenceUrl })
          }}
        />
      )}
      {explainFor && <ComplianceExplainModal finding={explainFor} period={{ ps: periodStart, pe: periodEnd }} onClose={() => setExplainFor(null)} />}
    </div>
  )
}

function ProgressBar({ percent, text }: { percent: number; text?: string }) {
  const p = Math.max(0, Math.min(100, percent || 0))
  return (
    <div className="rounded-lg border border-border/70 bg-card/70 p-3">
      <div className="mb-2 flex justify-between text-xs">
        <span>Completeness</span><span>{text ?? `${p}%`}</span>
      </div>
      <Progress data-test="completeness-bar" value={p} className="h-2.5" />
    </div>
  )
}

function StatusBadge({ status }: { status: Finding['status'] }) {
  if (status === 'PASS') return <Badge className="bg-success/20 text-success hover:bg-success/20">PASS</Badge>
  if (status === 'RISK') return <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">RISK</Badge>
  return <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/20">FAIL</Badge>
}

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
