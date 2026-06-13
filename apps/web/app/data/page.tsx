"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getJSON, gql } from '@/lib/api'
import UploadBillModal from '@/components/UploadBillModal'
import { quarterRangeFromDate, ReportMeta } from '@/lib/reportMeta'
import { useReportContext } from '../report-context'
import ReportContextBanner from '@/components/ReportContextBanner'
import { getClientRole } from '@/lib/role'
import { postAI } from '@/lib/api'
import { toast } from 'sonner'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  DataTableShell,
  EmptyState,
  FilterBar,
  PageHeader,
  SectionCard,
  StatusBanner,
} from '@/components/product'

type Fact = {
  id: string
  entityId: string
  metricCode: string
  periodStart: string
  periodEnd: string
  value: number
  unit: string
  status: 'DRAFT' | 'APPROVED'
  sourceType?: string
  sourceRef?: string
  outlier?: boolean
}

type FactFilters = {
  entityId?: string
  metricCode?: string
  status?: string
  periodStart?: string
  periodEnd?: string
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const LIST = `
query F($entityId: String, $metricCode: String, $status: String, $periodStart: String, $periodEnd: String){
  listFacts(entityId:$entityId, metricCode:$metricCode, status:$status, periodStart:$periodStart, periodEnd:$periodEnd){
    id entityId metricCode periodStart periodEnd value unit status sourceType sourceRef outlier
  }
}`

const APPROVE = `
mutation A($id: ID!){ approveFact(id:$id) }
`

function normalizeFilters(input: FactFilters): FactFilters {
  return {
    entityId: input.entityId?.trim() || undefined,
    metricCode: input.metricCode?.trim() || undefined,
    status: input.status?.trim() || undefined,
    periodStart: input.periodStart?.trim() || undefined,
    periodEnd: input.periodEnd?.trim() || undefined,
  }
}

function compareFacts(a: Fact, b: Fact): number {
  const periodCompare = b.periodStart.localeCompare(a.periodStart)
  if (periodCompare !== 0) return periodCompare
  const metricCompare = a.metricCode.localeCompare(b.metricCode)
  if (metricCompare !== 0) return metricCompare
  const entityCompare = a.entityId.localeCompare(b.entityId)
  if (entityCompare !== 0) return entityCompare
  return a.id.localeCompare(b.id)
}

export default function DataHubPage() {
  const { reportId } = useReportContext()
  const role = getClientRole()
  const qc = useQueryClient()
  const [filters, setFilters] = useState<FactFilters>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const onboarding =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('onboarding') === '1' : false
  const onboardingStep = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('step') : null

  const q = useQuery({
    queryKey: ['facts', filters],
    queryFn: async () => (await gql<{ listFacts: Fact[] }>(LIST, filters)).listFacts,
  })

  const approve = useMutation({
    mutationFn: async (id: string) => (await gql<{ approveFact: boolean }>(APPROVE, { id })).approveFact,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facts'] }),
  })

  const fallbackQStart =
    (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || new Date().toISOString().slice(0, 10)
  const fallbackRange = quarterRangeFromDate(fallbackQStart)
  const periodStart = filters.periodStart || fallbackRange.periodStart
  const periodEnd = filters.periodEnd || fallbackRange.periodEnd

  const selectedReport = useQuery({
    queryKey: ['report-meta', reportId],
    enabled: !!reportId,
    queryFn: async () => await getJSON<ReportMeta>(`/reports/${reportId}`),
  })
  const periodReport = useQuery({
    queryKey: ['report-meta-by-period', periodStart, periodEnd, reportId],
    enabled: !reportId,
    queryFn: async () => await getJSON<ReportMeta | null>(`/reports/by-period?periodStart=${periodStart}&periodEnd=${periodEnd}`),
  })

  const activeReport = selectedReport.data ?? periodReport.data ?? null
  const isFrozenPeriod = !!activeReport?.isLocked
  const canApprove = role === 'ADMIN'

  const rows = useMemo(() => {
    const base = q.data ?? []
    return [...base].sort(compareFacts)
  }, [q.data])

  const hasOutliers = rows.some((r) => r.outlier)
  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageStart = (page - 1) * pageSize
  const pagedRows = rows.slice(pageStart, pageStart + pageSize)
  const isLoading = q.status === 'pending'
  const isError = q.status === 'error'
  const errorMessage = q.error instanceof Error ? q.error.message : 'Failed to load facts for this filter set.'

  return (
    <div className="space-y-4">
      <ReportContextBanner meta={activeReport} />
      <PageHeader
        title="Data Hub"
        description="Upload evidence-backed data, validate mappings, and approve report facts."
        right={(
          <UploadBillModal
            data-test="data-upload-btn"
            onUploaded={() => qc.invalidateQueries({ queryKey: ['facts'] })}
            disabled={isFrozenPeriod}
            title={isFrozenPeriod ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}
          />
        )}
      />

      {isFrozenPeriod && (
        <StatusBanner tone="success">
          Frozen Snapshot - fact approvals and uploads are disabled.
        </StatusBanner>
      )}
      {onboarding && onboardingStep === '1' && (
        <StatusBanner tone="info" testId="onboarding-tooltip-step-1">
          Step 1: Upload bill. Step 2: Approve at least one draft fact. Then go to{' '}
          <Link href="/reports?onboarding=1&step=3">Reports</Link> for freeze.
        </StatusBanner>
      )}

      <Filters
        value={filters}
        onApply={(next) => {
          setFilters(next)
          setPage(1)
        }}
      />

      {hasOutliers && (
        <StatusBanner tone="warning">
          Heads up: potential outliers flagged. Review before approving.
        </StatusBanner>
      )}

      <SectionCard
        title="Facts"
        right={<span className="text-sm text-muted-foreground">{totalRows} row(s) available</span>}
      >
        {isLoading ? (
          <DataTableShell testId="data-hub-loading">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Outlier</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} aria-hidden="true">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        ) : null}

        {isError ? (
          <StatusBanner tone="danger" testId="data-hub-error">
            <div className="flex flex-wrap items-center gap-3">
              <span>{errorMessage}</span>
              <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                Retry
              </Button>
            </div>
          </StatusBanner>
        ) : null}

        {!isLoading && !isError && rows.length === 0 ? (
          <EmptyState
            testId="data-hub-empty"
            title="No facts found"
            subtitle="Try adjusting filters, date range, or upload a new source file."
            action={(
              <Button variant="outline" onClick={() => { setFilters({}); setPage(1) }}>
                Clear filters
              </Button>
            )}
          />
        ) : null}

        {!isLoading && !isError && rows.length > 0 ? (
          <div className="space-y-3">
            <DataTableShell testId="data-hub-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Outlier</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.metricCode}</TableCell>
                      <TableCell><code>{r.entityId.slice(0, 8)}</code></TableCell>
                      <TableCell>{r.periodStart} to {r.periodEnd}</TableCell>
                      <TableCell>{r.value.toLocaleString()}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.sourceRef || '-'}</TableCell>
                      <TableCell>
                        {r.outlier ? (
                          <button
                            className="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-semibold text-warning-foreground hover:bg-warning/30"
                            data-test="outlier-explain"
                            onClick={async () => {
                              try {
                                const sameMetric = rows.filter(f => f.metricCode === r.metricCode && f.entityId === r.entityId && f.id !== r.id)
                                const res = await postAI<{ explanation: string; severity: string; suggestions: string[] }>('/anomaly/explain', {
                                  metricCode: r.metricCode,
                                  currentValue: r.value,
                                  unit: r.unit,
                                  historicalValues: sameMetric.map(f => f.value),
                                  periodStart: r.periodStart,
                                  periodEnd: r.periodEnd,
                                })
                                toast.info(res.explanation, { duration: 8000, description: res.suggestions?.join(' ') })
                              } catch {
                                toast.warning(`Outlier: ${r.metricCode} = ${r.value} ${r.unit} deviates from historical average.`)
                              }
                            }}
                            title="Click for AI explanation"
                          >
                            Outlier
                          </button>
                        ) : ''}
                      </TableCell>
                      <TableCell>
                        {r.status === 'DRAFT' ? (
                          <Button
                            size="sm"
                            data-test="approve-btn"
                            onClick={() => approve.mutate(r.id)}
                            disabled={approve.isPending || isFrozenPeriod || !canApprove}
                            title={isFrozenPeriod ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}
                          >
                            Approve
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-sm">
              <div data-test="data-hub-page-indicator" className="text-muted-foreground">
                Showing {pageStart + 1}-{Math.min(pageStart + pageSize, totalRows)} of {totalRows}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-20" data-test="data-hub-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  data-test="data-hub-pagination-prev"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-test="data-hub-pagination-next"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  )
}

function Filters({
  value,
  onApply,
}: {
  value: FactFilters
  onApply: (v: FactFilters) => void
}) {
  const [local, setLocal] = useState<FactFilters>(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  const apply = () => onApply(normalizeFilters(local))

  return (
    <FilterBar className="md:grid-cols-[repeat(5,minmax(0,1fr))_120px_120px]">
      <Input
        placeholder="Entity ID"
        value={local.entityId || ''}
        onChange={(e) => setLocal({ ...local, entityId: e.target.value })}
      />
      <Input
        placeholder="Metric code (e.g. ELEC_KWH)"
        value={local.metricCode || ''}
        onChange={(e) => setLocal({ ...local, metricCode: e.target.value })}
      />
      <Select value={local.status || '__all'} onValueChange={(v) => setLocal({ ...local, status: v === '__all' ? undefined : v })}>
        <SelectTrigger>
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Any status</SelectItem>
          <SelectItem value="DRAFT">DRAFT</SelectItem>
          <SelectItem value="APPROVED">APPROVED</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" value={local.periodStart || ''} onChange={(e) => setLocal({ ...local, periodStart: e.target.value })} />
      <Input type="date" value={local.periodEnd || ''} onChange={(e) => setLocal({ ...local, periodEnd: e.target.value })} />
      <Button onClick={apply}>Apply</Button>
      <Button variant="outline" onClick={() => { setLocal({}); onApply({}) }}>
        Clear
      </Button>
    </FilterBar>
  )
}
