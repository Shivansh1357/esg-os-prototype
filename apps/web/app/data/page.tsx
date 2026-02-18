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
    <div>
      <ReportContextBanner meta={activeReport} />
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <h2 style={{fontSize:18}}>Data Hub</h2>
        <UploadBillModal
          data-test="data-upload-btn"
          onUploaded={()=> qc.invalidateQueries({ queryKey:['facts'] })}
          disabled={isFrozenPeriod}
          title={isFrozenPeriod ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}
        />
      </div>

      {isFrozenPeriod && (
        <div style={{ margin:'0 0 12px', padding:10, border:'1px solid #274', borderRadius:8, background:'#0f2318' }}>
          Frozen Snapshot - fact approvals and uploads are disabled.
        </div>
      )}
      {onboarding && onboardingStep === '1' && (
        <div data-test="onboarding-tooltip-step-1" style={{ margin:'0 0 12px', padding:10, border:'1px solid #345', borderRadius:8, background:'#111a2b' }}>
          Step 1: Upload bill. Step 2: Approve at least one draft fact. Then go to{' '}
          <Link href="/reports?onboarding=1&step=3">Reports</Link> for freeze.
        </div>
      )}

      <Filters value={filters} onChange={setFilters} />

      {hasOutliers && (
        <div style={{margin:'12px 0', padding:10, background:'#221a00', border:'1px solid #332200', borderRadius:8}}>
          Heads up: potential outliers flagged. Review before approving.
        </div>
      )}

      <div style={{overflowX:'auto', border:'1px solid #223', borderRadius:8}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr><Th>Metric</Th><Th>Entity</Th><Th>Period</Th><Th>Value</Th><Th>Unit</Th><Th>Status</Th><Th>Evidence</Th><Th>Outlier</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <Td>{r.metricCode}</Td>
                <Td><code>{r.entityId.slice(0,8)}</code></Td>
                <Td>{r.periodStart} → {r.periodEnd}</Td>
                <Td>{r.value.toLocaleString()}</Td>
                <Td>{r.unit}</Td>
                <Td>{r.status}</Td>
                <Td style={{maxWidth:220, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.sourceRef || '-'}</Td>
                <Td>{r.outlier ? '⚠️' : ''}</Td>
                <Td>
                  {r.status === 'DRAFT' && (
                    <button
                      data-test="approve-btn"
                      onClick={()=>approve.mutate(r.id)}
                      disabled={approve.isPending || isFrozenPeriod || !canApprove}
                      title={isFrozenPeriod ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}
                    >
                      Approve
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Filters({ value, onChange }:{ value:any; onChange:(v:any)=>void }) {
  const [local, setLocal] = useState(value)
  const apply = () => onChange(local)
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(5, minmax(160px, 1fr)) 120px', gap:8, margin:'12px 0'}}>
      <input placeholder="Entity ID" value={local.entityId||''} onChange={e=>setLocal({...local, entityId:e.target.value})}/>
      <input placeholder="Metric code (e.g. ELEC_KWH)" value={local.metricCode||''} onChange={e=>setLocal({...local, metricCode:e.target.value})}/>
      <select value={local.status||''} onChange={e=>setLocal({...local, status:e.target.value||undefined})}>
        <option value="">Any status</option><option>DRAFT</option><option>APPROVED</option>
      </select>
      <input type="date" value={local.periodStart||''} onChange={e=>setLocal({...local, periodStart:e.target.value})}/>
      <input type="date" value={local.periodEnd||''} onChange={e=>setLocal({...local, periodEnd:e.target.value})}/>
      <button onClick={apply}>Apply</button>
    </div>
  )
}

function Th({children}:{children:React.ReactNode}){ return <th style={{textAlign:'left', padding:8, background:'#11182f', borderBottom:'1px solid #223'}}>{children}</th>}
function Td({children, style}:{children:React.ReactNode; style?: React.CSSProperties}){ return <td style={{padding:8, borderBottom:'1px solid #223', ...(style||{})}}>{children}</td>}
