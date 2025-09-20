'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { gql } from '@/lib/api'
import LineageDrawer from '@/components/LineageDrawer'

const CREATE = `
mutation C($name:String!, $template:String!){
  createReport(name:$name, template:$template)
}`

const FREEZE = `
mutation F($reportId:String!){
  freezeReport(reportId:$reportId)
}`

type Artifact = { format: 'pdf'|'xlsx'; url: string }
type AccessOut = { url: string; expiresAt: string }

export default function ReportsPage() {
  const [name, setName] = useState<string>(() => `BRSR Draft – ${new Date().toISOString().slice(0,10)}`)
  const [template, setTemplate] = useState<'BRSR'>('BRSR')
  const [reportId, setReportId] = useState<string | null>(null)

  const [exporting, setExporting] = useState<'pdf'|'xlsx'|null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [auditor, setAuditor] = useState<{ token?: string; url?: string; expiresAt?: string } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerData, setDrawerData] = useState<any | null>(null)
  const [assuring, setAssuring] = useState(false)
  const [freezing, setFreezing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [busyPrev, setBusyPrev] = useState(false)

  const create = useMutation({
    mutationFn: async () => {
      const res = await gql<{ createReport: string }>(CREATE, { name, template })
      return res.createReport
    },
    onSuccess: (id) => {
      setReportId(id)
      setMsg('Draft created with default quarter. You can now export & use auditor tools.')
    },
    onError: (e: any) => setMsg(e?.message || 'Failed to create report')
  })

  async function exportReport(fmt: 'pdf'|'xlsx') {
    if (!reportId) return
    setExporting(fmt); setMsg(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/${reportId}/export?format=${fmt}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
        },
        body: JSON.stringify({})
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json() as { url: string }
      setArtifacts(a => [{ format: fmt, url: j.url }, ...a])
      setMsg(`Exported ${fmt.toUpperCase()} – link ready below.`)
    } catch (e:any) {
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
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
        },
        body: JSON.stringify({ reportId })
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json() as AccessOut
      const token = j.url.split('/').pop()!
      setAuditor({ token, url: j.url, expiresAt: j.expiresAt })
      setMsg('Auditor link generated.')
    } catch (e:any) {
      setMsg(e?.message || 'Failed to create auditor link')
    }
  }

  async function openLineage() {
    if (!auditor?.token) {
      await generateAuditorLink()
    }
    const token = (auditor?.token) || (await (async ()=> {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auditor/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
        },
        body: JSON.stringify({ reportId })
      })
      const j = await r.json() as AccessOut
      const t = j.url.split('/').pop()!
      setAuditor({ token: t, url: j.url, expiresAt: j.expiresAt })
      return t
    })())

    try {
      const lr = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/auditor/${token}/lineage`)
      if (!lr.ok) throw new Error(await lr.text())
      const lineage = await lr.json()
      setDrawerData(lineage)
      setDrawerOpen(true)
    } catch (e:any) {
      setMsg(e?.message || 'Failed to load lineage')
    }
  }

  async function exportAssurance() {
    if (!auditor?.token) return
    setAssuring(true)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/auditor/${auditor.token}/assurance`, { method:'POST' })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json() as { url: string }
      window.open(j.url, '_blank', 'noopener,noreferrer')
    } catch (e:any) {
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
    onSuccess: () => setMsg('Report frozen: version bumped & inputs locked.'),
    onError: (e:any) => setMsg(e?.message || 'Freeze failed')
  })

  return (
    <div>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'end', gap:12, marginBottom:12}}>
        <div>
          <h2 style={{fontSize:18, marginBottom:6}}>Reports</h2>
          <small>Create a draft, export, and manage auditor access & freeze.</small>
        </div>
      </header>

      <section style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:16}}>
        <div style={{border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020'}}>
          <h3 style={{marginTop:0}}>Generate Draft</h3>
          <div style={{display:'grid', gridTemplateColumns:'1fr 240px', gap:8}}>
            <div>
              <label>Report name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="BRSR Draft – YYYY-MM-DD"/>
            </div>
            <div>
              <label>Template</label>
              <select value={template} onChange={e=>setTemplate(e.target.value as any)}>
                <option value="BRSR">BRSR</option>
              </select>
            </div>
          </div>
          <div style={{marginTop:12, display:'flex', gap:8}}>
            <button data-test="generate-draft" onClick={()=>create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Generate Draft'}
            </button>
            {reportId && (
              <>
                <button data-test="export-pdf" onClick={()=>exportReport('pdf')} disabled={exporting==='pdf'}>Export PDF</button>
                <button data-test="export-xlsx" onClick={()=>exportReport('xlsx')} disabled={exporting==='xlsx'}>Export Excel</button>
                <button onClick={async ()=>{
                  setBusyPrev(true)
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_AI_URL || process.env.NEXT_PUBLIC_API_URL}/narrative/section`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        template: 'BRSR',
                        section: 'EMISSIONS',
                        periodStart: new Date().toISOString().slice(0,10),
                        periodEnd: new Date().toISOString().slice(0,10),
                        kpis: {}, factorSet: { code: 'IN-CEA-2024', version: '1.0' }
                      })
                    })
                    const j = await res.json()
                    setPreview(j.text || '')
                  } finally { setBusyPrev(false) }
                }} disabled={!reportId || busyPrev}>{busyPrev ? 'Generating…' : 'Preview narrative'}</button>
              </>
            )}
          </div>
          {msg && <div style={{marginTop:10, fontSize:12, opacity:0.9}}>{msg}</div>}
        </div>

        <div style={{border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020'}}>
          <h3 style={{marginTop:0}}>Sections</h3>
          {!reportId && <p style={{opacity:0.8}}>Create a draft to view sections.</p>}
          {reportId && (
            <>
              <ul style={{listStyle:'none', padding:0, margin:0}}>
                {[
                  {code:'SUMMARY', title:'Executive Summary', status:'DRAFT'},
                  {code:'EMISSIONS', title:'Emissions Overview', status:'DRAFT'},
                  {code:'COMPLIANCE', title:'BRSR Compliance', status:'DRAFT'},
                ].map(s=> (
                  <li key={s.code} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #223'}}>
                    <span><code>{s.code}</code> — {s.title}</span>
                    <StatusBadge status={s.status as 'DRAFT'|'APPROVED'} />
                  </li>
                ))}
              </ul>
              <small style={{display:'block', marginTop:8, opacity:0.7}}>
                When a read API is available, we’ll pull live section states here.
              </small>
            </>
          )}
        </div>
      </section>

      {preview && (
        <section style={{ marginTop:12, border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020' }}>
          <h3 style={{ marginTop:0 }}>Draft Section</h3>
          <p style={{ whiteSpace:'pre-wrap' }}>{preview}</p>
        </section>
      )}

      <section style={{marginTop:16, border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020'}}>
        <h3 style={{marginTop:0}}>Auditor Tools</h3>
        {!reportId && <p style={{opacity:0.8}}>Create a report to enable this panel.</p>}
        {reportId && (
          <>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button data-test="auditor-generate" onClick={generateAuditorLink}>Generate access link</button>
              <button data-test="lineage-open" onClick={openLineage} disabled={!auditor?.token}>View lineage</button>
              <button data-test="assurance-export" onClick={exportAssurance} disabled={!auditor?.token || assuring}>
                {assuring ? 'Exporting…' : 'Assurance worksheet'}
              </button>
              <button data-test="freeze-report" onClick={()=>freeze.mutate()} disabled={freezing}>
                {freezing ? 'Freezing…' : 'Freeze report'}
              </button>
            </div>
            {auditor?.url && (
              <div style={{marginTop:8, fontSize:12}}>
                <div><b>Access link:</b> <a href={auditor.url} target="_blank" rel="noreferrer">{auditor.url}</a></div>
                <div><b>Expires:</b> {new Date(auditor.expiresAt!).toLocaleString()}</div>
              </div>
            )}
          </>
        )}
      </section>

      <section style={{marginTop:16}}>
        <h3>Exports</h3>
        {artifacts.length === 0 && <p style={{opacity:0.8}}>No exports yet. Generate a draft and export to see links here.</p>}
        <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:8}}>
          {artifacts.map((a,i)=> (
            <li key={`${a.format}-${i}`} style={{display:'flex', justifyContent:'space-between', border:'1px solid #223', borderRadius:10, padding:10}}>
              <span><b>{a.format.toUpperCase()}</b> — signed URL (1h):</span>
              <a href={a.url} target="_blank" rel="noreferrer">Download</a>
            </li>
          ))}
        </ul>
      </section>

      {drawerOpen && drawerData && (
        <LineageDrawer data={drawerData} onClose={()=>setDrawerOpen(false)} />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'DRAFT'|'APPROVED' }) {
  const map: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: '#332a00', fg: '#ffd36e' },
    APPROVED: { bg: '#0d2f21', fg: '#7be3b6' },
  }
  const s = map[status]
  return <span style={{ padding:'2px 8px', borderRadius:999, background:s.bg, color:s.fg, fontSize:12 }}>{status}</span>
}


