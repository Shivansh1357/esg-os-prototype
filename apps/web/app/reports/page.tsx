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
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Reports</h2>
          <small>Create a draft, export, and manage auditor access & freeze.</small>
        </div>
        <div style={{ minWidth: 360 }}>
          <label>Active report context</label>
          <select
            data-test="report-selector"
            style={{ width: '100%' }}
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
      </header>

      <ReportContextBanner meta={meta} />
      {meta && (
        <div
          data-test="export-mode-banner"
          style={{ marginBottom: 12, padding: 10, border: '1px solid #223', borderRadius: 8, background: '#0f1630' }}
        >
          {meta.isLocked ? 'Snapshot Mode' : 'Live Mode'}
        </div>
      )}
      {onboarding && onboardingStep === '3' && (
        <div data-test="onboarding-tooltip-step-3" style={{ marginBottom: 12, padding: 10, border: '1px solid #345', borderRadius: 8, background: '#111a2b' }}>
          Step 3: Freeze report after approvals and compliance. Step 4: View executive cockpit in{' '}
          <Link href={`/exec${reportId ? `?reportId=${reportId}&onboarding=1&step=4` : '?onboarding=1&step=4'}`}>Exec</Link>.
        </div>
      )}
      {isAuditor && (
        <div
          data-test="auditor-readonly-banner"
          style={{ marginBottom: 12, padding: 10, border: '1px solid #463', borderRadius: 8, background: '#1f1a12' }}
        >
          Auditor View (Read-only)
        </div>
      )}

      <section style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Report Metadata</h3>
        <div data-test="report-status" style={{ marginBottom: 8 }}>
          <b>Status:</b> {meta ? (meta.isLocked ? 'Frozen' : 'Draft') : 'Not selected'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px,1fr))', gap: 8, fontSize: 13 }}>
          <div><b>Factor Set:</b> {meta?.factorSetCode ? `${meta.factorSetCode} ${meta.factorSetVersion || ''}` : '—'}</div>
          <div data-test="calc-version"><b>Calc Version:</b> {meta?.calcVersion ?? '—'}</div>
          <div data-test="completeness"><b>Completeness %:</b> {meta?.completenessPercent ?? '—'}</div>
          <div><b>Frozen At:</b> {meta?.frozenAt ? new Date(meta.frozenAt).toLocaleString() : '—'}</div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
          <h3 style={{ marginTop: 0 }}>Generate Draft</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 8 }}>
            <div><label>Report name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="BRSR Draft - YYYY-MM-DD" /></div>
            <div><label>Template</label><select value={template} onChange={e => setTemplate(e.target.value as any)}><option value="BRSR">BRSR</option></select></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {!isAuditor && (
              <button data-test="generate-draft" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? 'Creating...' : 'Generate Draft'}</button>
            )}
            {reportId && (
              <>
                <button data-test="export-pdf" onClick={() => exportReport('pdf')} disabled={exporting === 'pdf' || !canExport} title={!canExport ? 'Auditors can export frozen reports only.' : ''}>Export PDF</button>
                <button data-test="export-xlsx" onClick={() => exportReport('xlsx')} disabled={exporting === 'xlsx' || !canExport} title={!canExport ? 'Auditors can export frozen reports only.' : ''}>Export Excel</button>
                <button data-test="export-json" onClick={() => exportReport('json')} disabled={exporting === 'json' || !canExport} title={!canExport ? 'Auditors can export frozen reports only.' : ''}>Export JSON</button>
              </>
            )}
          </div>
          {msg && <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>{msg}</div>}
        </div>

        <div style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
          <h3 style={{ marginTop: 0 }}>Sections</h3>
          {!reportId && <p style={{ opacity: 0.8 }}>Select or create a report to view sections.</p>}
          {reportId && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {['SUMMARY', 'EMISSIONS', 'COMPLIANCE'].map(code => (
                <li key={code} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #223' }}>
                  <span><code>{code}</code></span>
                  <span style={{ opacity: 0.8 }}>{isLocked ? 'LOCKED' : 'DRAFT'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section style={{ marginTop: 16, border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
        <h3 style={{ marginTop: 0 }}>Auditor Tools</h3>
        {!reportId && <p style={{ opacity: 0.8 }}>Select a report to enable this panel.</p>}
        {reportId && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button data-test="auditor-generate" onClick={generateAuditorLink}>Generate access link</button>
              <button data-test="lineage-open" onClick={openLineage} disabled={!auditor?.token}>View lineage</button>
              <button data-test="assurance-export" onClick={exportAssurance} disabled={!auditor?.token || assuring}>{assuring ? 'Exporting...' : 'Assurance worksheet'}</button>
              {isAdmin && (
                <button data-test="freeze-report" onClick={() => freeze.mutate()} disabled={freezing || isLocked} title={isLocked ? 'Report is frozen. Unlocking requires creating a new report version.' : ''}>
                  {freezing ? 'Freezing...' : isLocked ? 'Frozen' : 'Freeze report'}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Exports</h3>
        {artifacts.length === 0 && <p style={{ opacity: 0.8 }}>No exports yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {artifacts.map((a, i) => (
            <li key={`${a.format}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #223', borderRadius: 10, padding: 10 }}>
              <span><b>{a.format.toUpperCase()}</b> ({a.mode})</span>
              <a href={a.url} target="_blank" rel="noreferrer">Download</a>
            </li>
          ))}
        </ul>
      </section>

      {drawerOpen && drawerData && <LineageDrawer data={drawerData} onClose={() => setDrawerOpen(false)} />}
    </div>
  )
}
