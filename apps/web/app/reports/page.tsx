'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getJSON, gql } from '@/lib/api'
import LineageDrawer from '@/components/LineageDrawer'
import ReportContextBanner from '@/components/ReportContextBanner'
import { ReportListItem, ReportMeta } from '@/lib/reportMeta'
import { useReportContext } from '../report-context'
import { getClientRole } from '@/lib/role'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ActionBar,
  DataTableShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBanner,
} from '@/components/product'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const CREATE = `
mutation C($name:String!, $template:String!){
  createReport(name:$name, template:$template)
}`

const FREEZE = `
mutation F($reportId:String!){
  freezeReport(reportId:$reportId)
}`

type Artifact = { format: 'pdf' | 'xlsx' | 'json'; url: string; mode: 'live' | 'snapshot' }
type AccessOut = { url: string; expiresAt: string }
type ExportOut = { url: string; mode: 'live' | 'snapshot' }

export default function ReportsPage() {
  const qc = useQueryClient()
  const { reportId, setReportId } = useReportContext()
  const [name, setName] = useState<string>(() => `BRSR Draft - ${new Date().toISOString().slice(0, 10)}`)
  const [template, setTemplate] = useState<'BRSR'>('BRSR')
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | 'json' | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [auditor, setAuditor] = useState<{ token?: string; url?: string; expiresAt?: string } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerData, setDrawerData] = useState<any | null>(null)
  const [assuring, setAssuring] = useState(false)
  const [auditPacking, setAuditPacking] = useState(false)
  const [freezing, setFreezing] = useState(false)
  const onboarding = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('onboarding') === '1' : false
  const onboardingStep = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('step') : null

  const reports = useQuery({
    queryKey: ['reports-list'],
    queryFn: async () => await getJSON<ReportListItem[]>('/reports')
  })

  const reportMeta = useQuery({
    queryKey: ['report-meta', reportId],
    enabled: !!reportId,
    queryFn: async () => await getJSON<ReportMeta>(`/reports/${reportId}`)
  })
  const meta = reportMeta.data
  const isLocked = !!meta?.isLocked
  const role = getClientRole()
  const isAdmin = role === 'ADMIN'
  const isAuditor = role === 'AUDITOR'
  const canExport = role === 'ADMIN' || role === 'MEMBER' || (role === 'AUDITOR' && !!meta?.isLocked)

  const selectorOptions = useMemo(() => reports.data ?? [], [reports.data])

  const create = useMutation({
    mutationFn: async () => {
      const res = await gql<{ createReport: string }>(CREATE, { name, template })
      return res.createReport
    },
    onSuccess: async (id) => {
      setReportId(id)
      await qc.invalidateQueries({ queryKey: ['reports-list'] })
      await qc.invalidateQueries({ queryKey: ['report-meta', id] })
      setMsg('Draft created with default quarter. You can now export & use auditor tools.')
    },
    onError: (e: any) => setMsg(e?.message || 'Failed to create report')
  })

  async function exportReport(fmt: 'pdf' | 'xlsx' | 'json') {
    if (!reportId) return
    setExporting(fmt)
    setMsg(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/${reportId}/export?format=${fmt}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.NEXT_PUBLIC_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_AUTH_TOKEN}` } : {}),
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
          'x-role': role,
        },
        body: JSON.stringify({})
      })
      if (!r.ok) throw new Error(await r.text())
      const j = (await r.json()) as ExportOut
      setArtifacts((a) => [{ format: fmt, url: j.url, mode: j.mode }, ...a])
      setMsg(`Exported ${fmt.toUpperCase()} (${j.mode}).`)
      await qc.invalidateQueries({ queryKey: ['report-meta', reportId] })
      await qc.invalidateQueries({ queryKey: ['reports-list'] })
    } catch (e: any) {
      setMsg(e?.message || `Export ${fmt} failed`)
    } finally {
      setExporting(null)
    }
  }

  async function generateAuditorLink() {
    if (!reportId) return
    setMsg(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auditor/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.NEXT_PUBLIC_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_AUTH_TOKEN}` } : {}),
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
          'x-role': role,
        },
        body: JSON.stringify({ reportId })
      })
      if (!r.ok) throw new Error(await r.text())
      const j = (await r.json()) as AccessOut
      const token = j.url.split('/').pop()!
      setAuditor({ token, url: j.url, expiresAt: j.expiresAt })
      setMsg('Auditor link generated.')
    } catch (e: any) {
      setMsg(e?.message || 'Failed to create auditor link')
    }
  }

  async function openLineage() {
    if (!auditor?.token) await generateAuditorLink()
    const token = auditor?.token
    if (!token) return
    try {
      const lr = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/auditor/${token}/lineage`)
      if (!lr.ok) throw new Error(await lr.text())
      const lineage = await lr.json()
      setDrawerData(lineage)
      setDrawerOpen(true)
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load lineage')
    }
  }

  async function exportAssurance() {
    if (!auditor?.token) return
    setAssuring(true)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/auditor/${auditor.token}/assurance`, { method: 'POST' })
      if (!r.ok) throw new Error(await r.text())
      const j = (await r.json()) as { url: string }
      window.open(j.url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setMsg(e?.message || 'Assurance export failed')
    } finally {
      setAssuring(false)
    }
  }

  async function exportAuditPack() {
    if (!reportId) return
    setAuditPacking(true)
    setMsg(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/${reportId}/audit-pack`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.NEXT_PUBLIC_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_AUTH_TOKEN}` } : {}),
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
          'x-role': role,
        },
        body: JSON.stringify({})
      })
      if (!r.ok) throw new Error(await r.text())
      const j = (await r.json()) as ExportOut
      setArtifacts((a) => [{ format: 'zip' as any, url: j.url, mode: j.mode }, ...a])
      setMsg(`Audit pack exported (${j.mode}).`)
    } catch (e: any) {
      setMsg(e?.message || 'Audit pack export failed')
    } finally {
      setAuditPacking(false)
    }
  }

  const freeze = useMutation({
    mutationFn: async () => {
      if (!reportId) return false
      setFreezing(true)
      try {
        const res = await gql<{ freezeReport: boolean }>(FREEZE, { reportId })
        return res.freezeReport
      } finally {
        setFreezing(false)
      }
    },
    onSuccess: async () => {
      if (reportId) await qc.invalidateQueries({ queryKey: ['report-meta', reportId] })
      await qc.invalidateQueries({ queryKey: ['reports-list'] })
      setMsg('Report frozen: version bumped & inputs locked.')
    },
    onError: (e: any) => setMsg(e?.message || 'Freeze failed')
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description="Create drafts, export report artifacts, and manage auditor access and freeze controls."
        right={(
          <div className="w-full min-w-[280px] space-y-2 md:w-96">
            <Label>Active report context</Label>
            <select
              data-test="report-selector"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reportId ?? ''}
              onChange={(e) => setReportId(e.target.value || null)}
            >
              <option value="">Select report…</option>
              {selectorOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.periodStart} → {item.periodEnd} • {item.isLocked ? 'Frozen' : 'Draft'}
                </option>
              ))}
            </select>
          </div>
        )}
      />

      <ReportContextBanner meta={meta} />
      {meta && (
        <StatusBanner testId="export-mode-banner" tone="info">
          {meta.isLocked ? 'Snapshot Mode' : 'Live Mode'}
        </StatusBanner>
      )}
      {onboarding && onboardingStep === '3' && (
        <StatusBanner testId="onboarding-tooltip-step-3" tone="info">
          Step 3: Freeze report after approvals and compliance. Step 4: View executive cockpit in{' '}
          <Link href={`/exec${reportId ? `?reportId=${reportId}&onboarding=1&step=4` : '?onboarding=1&step=4'}`}>Exec</Link>.
        </StatusBanner>
      )}
      {isAuditor && (
        <StatusBanner testId="auditor-readonly-banner" tone="warning">
          Auditor View (Read-only)
        </StatusBanner>
      )}

      <SectionCard title="Report Metadata">
        <div data-test="report-status" className="mb-2 text-sm">
          <b>Status:</b> {meta ? (meta.isLocked ? 'Frozen' : 'Draft') : 'Not selected'}
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div><b>Factor Set:</b> {meta?.factorSetCode ? `${meta.factorSetCode} ${meta.factorSetVersion || ''}` : '—'}</div>
          <div data-test="calc-version"><b>Calc Version:</b> {meta?.calcVersion ?? '—'}</div>
          <div data-test="completeness"><b>Completeness %:</b> {meta?.completenessPercent ?? '—'}</div>
          <div><b>Frozen At:</b> {meta?.frozenAt ? new Date(meta.frozenAt).toLocaleString() : '—'}</div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <SectionCard title="Generate Draft">
          <div className="grid gap-2 md:grid-cols-[1fr_240px]">
            <div className="space-y-2">
              <Label>Report name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="BRSR Draft - YYYY-MM-DD" />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={template}
                onChange={e => setTemplate(e.target.value as any)}
              >
                <option value="BRSR">BRSR</option>
              </select>
            </div>
          </div>
          <ActionBar className="mt-3">
            {!isAuditor && (
              <Button data-test="generate-draft" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? 'Creating...' : 'Generate Draft'}
              </Button>
            )}
            {reportId && (
              <>
                <Button
                  variant="outline"
                  data-test="export-pdf"
                  onClick={() => exportReport('pdf')}
                  disabled={exporting === 'pdf' || !canExport}
                  title={!canExport ? 'Auditors can export frozen reports only.' : ''}
                >
                  Export PDF
                </Button>
                <Button
                  variant="outline"
                  data-test="export-xlsx"
                  onClick={() => exportReport('xlsx')}
                  disabled={exporting === 'xlsx' || !canExport}
                  title={!canExport ? 'Auditors can export frozen reports only.' : ''}
                >
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  data-test="export-json"
                  onClick={() => exportReport('json')}
                  disabled={exporting === 'json' || !canExport}
                  title={!canExport ? 'Auditors can export frozen reports only.' : ''}
                >
                  Export JSON
                </Button>
              </>
            )}
          </ActionBar>
          {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
        </SectionCard>

        <SectionCard title="Sections">
          {!reportId && <p className="text-sm text-muted-foreground">Select or create a report to view sections.</p>}
          {reportId && (
            <ul className="space-y-1">
              {['SUMMARY', 'EMISSIONS', 'COMPLIANCE'].map(code => (
                <li key={code} className="flex items-center justify-between border-b border-border/70 py-2 last:border-b-0">
                  <span><code>{code}</code></span>
                  <Badge variant={isLocked ? 'secondary' : 'outline'}>{isLocked ? 'LOCKED' : 'DRAFT'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Auditor Tools">
        {!reportId && <p className="text-sm text-muted-foreground">Select a report to enable this panel.</p>}
        {reportId && (
          <>
            <ActionBar>
              <Button data-test="auditor-generate" variant="outline" onClick={generateAuditorLink}>Generate access link</Button>
              <Button data-test="lineage-open" variant="outline" onClick={openLineage} disabled={!auditor?.token}>View lineage</Button>
              <Button data-test="assurance-export" variant="outline" onClick={exportAssurance} disabled={!auditor?.token || assuring}>{assuring ? 'Exporting...' : 'Assurance worksheet'}</Button>
              <Button data-test="audit-pack-export" variant="outline" onClick={exportAuditPack} disabled={auditPacking || !canExport}>{auditPacking ? 'Packing...' : 'Audit Pack (ZIP)'}</Button>
              {isAdmin && (
                <Button
                  data-test="freeze-report"
                  variant={isLocked ? 'secondary' : 'default'}
                  onClick={() => freeze.mutate()}
                  disabled={freezing || isLocked}
                  title={isLocked ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}
                >
                  {freezing ? 'Freezing...' : isLocked ? 'Frozen' : 'Freeze report'}
                </Button>
              )}
            </ActionBar>
          </>
        )}
      </SectionCard>

      <SectionCard title="Exports">
        {artifacts.length === 0 ? (
          <EmptyState title="No exports yet." subtitle="Generate any format to see downloadable artifacts here." />
        ) : (
          <DataTableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Format</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artifacts.map((a, i) => (
                  <TableRow key={`${a.format}-${i}`}>
                    <TableCell className="font-semibold">{a.format.toUpperCase()}</TableCell>
                    <TableCell>{a.mode}</TableCell>
                    <TableCell className="text-right">
                      <a href={a.url} target="_blank" rel="noreferrer">Download</a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        )}
      </SectionCard>

      {drawerOpen && drawerData && <LineageDrawer data={drawerData} onClose={() => setDrawerOpen(false)} />}
    </div>
  )
}
