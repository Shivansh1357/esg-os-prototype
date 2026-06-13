'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { getJSON, postJSON } from '@/lib/api'
import SupplierInviteModal from '@/components/SupplierInviteModal'
import ReportContextBanner from '@/components/ReportContextBanner'
import { useReportContext } from '../report-context'
import { ReportMeta } from '@/lib/reportMeta'
import { getClientRole } from '@/lib/role'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  DataTableShell,
  KpiGrid,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBanner,
} from '@/components/product'

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
  const chartData = (cov?.byCategory ?? []).map((c) => ({
    category: c.category,
    spend: c.spend,
    emissions: c.emissions_kgco2e,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers (Scope 3)"
        description="Invite suppliers, collect emissions submissions, and approve records into Scope 3."
        right={(
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label>Quarter start</Label>
              <Input type="date" value={toQuarterStart(date)} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                {activePs} → {activePe}
              </div>
            </div>
            <Button
              onClick={() => setOpen(true)}
              disabled={isLocked || isAuditor}
              title={isLocked ? 'Report is frozen. Unlocking requires creating a new report version.' : isAuditor ? 'Insufficient permissions.' : ''}
            >
              Invite suppliers
            </Button>
          </div>
        )}
      />

      <ReportContextBanner meta={activeMeta} />
      {isAuditor && (
        <StatusBanner tone="warning" testId="auditor-readonly-banner">
          Auditor View (Read-only)
        </StatusBanner>
      )}

      <KpiGrid>
        <Card testId="supplier-invited-count" label="Invited" value={cov?.invited ?? 0} />
        <Card testId="supplier-responded-count" label="Responded" value={cov?.responded ?? 0} />
        <Card testId="supplier-coverage-count" label="Coverage by count" value={`${(cov?.coverageByCountPercent ?? 0).toFixed(2)}%`} />
        <Card testId="supplier-coverage-spend" label="Coverage by spend" value={`${(cov?.coveragePercent ?? 0).toFixed(2)}%`} />
      </KpiGrid>

      <SectionCard title="Responses">
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Emissions (kgCO₂e)</TableHead>
                <TableHead>Quality Tier</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.isPending &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!responses.isPending && (responses.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.supplierName}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.emissionsKgCO2e == null ? '—' : fmt(r.emissionsKgCO2e)}</TableCell>
                  <TableCell>{r.dataQualityTier}</TableCell>
                  <TableCell>{new Date(r.submittedAt).toLocaleString()}</TableCell>
                  <TableCell>{r.approved ? 'Approved' : 'Pending'}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      data-test={`approve-supplier-${r.id}`}
                      onClick={() => approve.mutate(r.id)}
                      disabled={r.approved || isLocked || approve.isPending || !canApproveSupplier}
                      title={isLocked ? 'Report is frozen. Unlocking requires creating a new report version.' : !canApproveSupplier ? 'Insufficient permissions.' : ''}
                    >
                      {r.approved ? 'Approved' : 'Approve'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!responses.isPending && (!responses.data || responses.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No responses yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>

      <SectionCard title="By Category">
        <div className="mb-4">
          <ChartContainer config={supplierChartConfig} className="h-[320px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="category" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Bar dataKey="spend" fill="var(--color-spend)" radius={6} />
              <Bar dataKey="emissions" fill="var(--color-emissions)" radius={6} />
            </BarChart>
          </ChartContainer>
        </div>
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Responded suppliers</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Reported Emissions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cov?.byCategory ?? []).map((r) => (
                <TableRow key={r.category}>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.suppliers}</TableCell>
                  <TableCell>{fmt(r.spend)}</TableCell>
                  <TableCell>{fmt(r.emissions_kgco2e)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>

      {open && <SupplierInviteModal periodStart={activePs} periodEnd={activePe} onClose={() => setOpen(false)} />}
    </div>
  )
}

function Card({ label, value, testId }: { label: string; value: number | string; testId: string }) {
  return <StatCard label={label} value={value} testId={testId} />
}
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function todayISO() { return iso(new Date()) }
function toQuarterStart(s: string) { const d = new Date(s); const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); return iso(qs) }
function quarterRange(date: string) { const d = new Date(date); const qs = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); const qe = new Date(qs.getFullYear(), qs.getMonth() + 3, 0); return { ps: iso(qs), pe: iso(qe) } }
function fmt(n: number) { try { return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n) } catch { return String(n) } }

const supplierChartConfig = {
  spend: {
    label: 'Spend',
    color: 'hsl(var(--chart-1))',
  },
  emissions: {
    label: 'Emissions',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig
