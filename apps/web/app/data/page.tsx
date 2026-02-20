"use client"
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { getJSON, gql } from '@/lib/api'
import UploadBillModal from '@/components/UploadBillModal'
import { quarterRangeFromDate, ReportMeta } from '@/lib/reportMeta'
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
import {
  DataTableShell,
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
  status: 'DRAFT'|'APPROVED'
  sourceType?: string
  sourceRef?: string
  outlier?: boolean
}

const LIST = `
query F($entityId: String, $metricCode: String, $status: String, $periodStart: String, $periodEnd: String){
  listFacts(entityId:$entityId, metricCode:$metricCode, status:$status, periodStart:$periodStart, periodEnd:$periodEnd){
    id entityId metricCode periodStart periodEnd value unit status sourceType sourceRef outlier
  }
}`

const APPROVE = `
mutation A($id: ID!){ approveFact(id:$id) }
`

export default function DataHubPage() {
  const { reportId } = useReportContext()
  const role = getClientRole()
  const qc = useQueryClient()
  const [filters, setFilters] = useState<{entityId?:string; metricCode?:string; status?:string; periodStart?:string; periodEnd?:string}>({})
  const onboarding = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('onboarding') === '1' : false
  const onboardingStep = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('step') : null
  const q = useQuery({
    queryKey: ['facts', filters],
    queryFn: async ()=> (await gql<{listFacts: Fact[]}>(LIST, filters)).listFacts
  })
  const approve = useMutation({
    mutationFn: async (id: string)=> (await gql<{approveFact:boolean}>(APPROVE, {id})).approveFact,
    onSuccess: ()=> qc.invalidateQueries({ queryKey:['facts'] })
  })

  const fallbackQStart = (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || new Date().toISOString().slice(0,10)
  const fallbackRange = quarterRangeFromDate(fallbackQStart)
  const periodStart = filters.periodStart || fallbackRange.periodStart
  const periodEnd = filters.periodEnd || fallbackRange.periodEnd

  const selectedReport = useQuery({
    queryKey: ['report-meta', reportId],
    enabled: !!reportId,
    queryFn: async () => await getJSON<ReportMeta>(`/reports/${reportId}`)
  })
  const periodReport = useQuery({
    queryKey: ['report-meta-by-period', periodStart, periodEnd, reportId],
    enabled: !reportId,
    queryFn: async () => await getJSON<ReportMeta | null>(`/reports/by-period?periodStart=${periodStart}&periodEnd=${periodEnd}`)
  })
  const activeReport = selectedReport.data ?? periodReport.data ?? null
  const isFrozenPeriod = !!activeReport?.isLocked
  const canApprove = role === 'ADMIN'

  const rows = q.data ?? []
  const hasOutliers = rows.some(r => r.outlier)

  return (
    <div className="space-y-4">
      <ReportContextBanner meta={activeReport} />
      <PageHeader
        title="Data Hub"
        description="Upload evidence-backed data, validate mappings, and approve report facts."
        right={(
          <UploadBillModal
            data-test="data-upload-btn"
            onUploaded={()=> qc.invalidateQueries({ queryKey:['facts'] })}
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

      <Filters value={filters} onChange={setFilters} />

      {hasOutliers && (
        <StatusBanner tone="warning">
          Heads up: potential outliers flagged. Review before approving.
        </StatusBanner>
      )}

      <SectionCard title="Facts">
        <DataTableShell>
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
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.metricCode}</TableCell>
                  <TableCell><code>{r.entityId.slice(0,8)}</code></TableCell>
                  <TableCell>{r.periodStart} → {r.periodEnd}</TableCell>
                  <TableCell>{r.value.toLocaleString()}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.sourceRef || '-'}</TableCell>
                  <TableCell>{r.outlier ? '⚠️' : ''}</TableCell>
                  <TableCell>
                    {r.status === 'DRAFT' && (
                      <Button
                        size="sm"
                        data-test="approve-btn"
                        onClick={()=>approve.mutate(r.id)}
                        disabled={approve.isPending || isFrozenPeriod || !canApprove}
                        title={isFrozenPeriod ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}
                      >
                        Approve
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>
    </div>
  )
}

function Filters({ value, onChange }:{ value:any; onChange:(v:any)=>void }) {
  const [local, setLocal] = useState(value)
  const apply = () => onChange(local)
  return (
    <FilterBar className="md:grid-cols-[repeat(5,minmax(0,1fr))_120px]">
      <Input
        placeholder="Entity ID"
        value={local.entityId||''}
        onChange={e=>setLocal({...local, entityId:e.target.value})}
      />
      <Input
        placeholder="Metric code (e.g. ELEC_KWH)"
        value={local.metricCode||''}
        onChange={e=>setLocal({...local, metricCode:e.target.value})}
      />
      <Select value={local.status||'__all'} onValueChange={v=>setLocal({...local, status:v==='__all'?undefined:v})}>
        <SelectTrigger>
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Any status</SelectItem>
          <SelectItem value="DRAFT">DRAFT</SelectItem>
          <SelectItem value="APPROVED">APPROVED</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" value={local.periodStart||''} onChange={e=>setLocal({...local, periodStart:e.target.value})}/>
      <Input type="date" value={local.periodEnd||''} onChange={e=>setLocal({...local, periodEnd:e.target.value})}/>
      <Button onClick={apply}>Apply</Button>
    </FilterBar>
  )
}
