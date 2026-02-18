"use client"
import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { postJSON, gql, postAI } from '@/lib/api'

// D3 enriched mapping response types
type MapAlt = { header: string; score: number }
type MapResp = { mapping: Record<string, string>; confidence: number; alternatives?: Record<string, MapAlt[]>; warnings?: string[] }

const UPSERT = `
mutation U($input: UpsertFactInput!){ upsertFact(input:$input) }
`

type Props = { onUploaded?: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>

export default function UploadBillModal({ onUploaded, ...btn }: Props) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<'idle' | 'presign' | 'uploading' | 'parsing' | 'mapping' | 'confirm' | 'done'>('idle')
  const [preview, setPreview] = useState<any[]>([])
  const [mapResp, setMapResp] = useState<MapResp | null>(null)
  const [selected, setSelected] = useState<{ date?: string; kWh?: string; site?: string }>({})
  const [s3Key, setS3Key] = useState<string | undefined>(undefined)
  const ref = useRef<HTMLInputElement>(null)
  const aiUrl = (process.env.NEXT_PUBLIC_AI_URL as string) || 'http://localhost:8001'

  return (
    <>
      <button {...btn} onClick={() => setOpen(true)}>Upload</button>
      {open && (
        <div style={modalStyle()}>
          <div style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Upload Utility Bill / Energy CSV</h3>
            <input type="file" accept=".csv,.pdf,.xlsx,.xls" ref={ref} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button data-test="upload-bill-start-btn" onClick={handleGo} disabled={!file || stage !== 'idle'}>Start</button>
              <button onClick={() => setOpen(false)}>Close</button>
            </div>

            <Stage stage={stage} preview={preview} mapResp={mapResp} selected={selected} setSelected={setSelected} onConfirm={confirmUpsert} />
          </div>
        </div>
      )}
    </>
  )

  async function handleGo() {
    if (!file) return
    setStage('presign')
    const presign = await postJSON<{ s3Key: string; meta: any; post: { url: string; fields: Record<string, string> } }>('/upload', {
      filename: file.name,
      contentType: file.type || 'application/octet-stream'
    })
    setS3Key(presign.s3Key)

    setStage('uploading')
    if (!presign.post.url.startsWith('mock://')) {
      const fd = new FormData()
      Object.entries(presign.post.fields).forEach(([k, v]) => fd.append(k, v))
      fd.append('Content-Type', file.type || 'application/octet-stream')
      fd.append('file', file)
      const upl = await fetch(presign.post.url, { method: 'POST', body: fd })
      if (!upl.ok) throw new Error('S3 upload failed')
    }

    setStage('parsing')
    if (file.name.toLowerCase().endsWith('.csv')) {
      const rows = await parseCSV(file)
      setPreview(rows.slice(0, 20))
      setStage('mapping')
      try {
        const resp = await postAI<MapResp>('/map/columns', { headers: Object.keys(rows[0] ?? {}) })
        setMapResp(resp)
        setSelected(resp.mapping as any)
      } catch {
        try {
          const resp = await postJSON<MapResp>('/ai/map/columns', { headers: Object.keys(rows[0] ?? {}) } as any)
          setMapResp(resp)
          setSelected(resp.mapping as any)
        } catch { }
      }
    } else {
      try {
        const ai = await postAI<{ fields: Array<{ name: string; candidates: Array<{ value: string; conf: number }> }> }>(
          '/ocr/utility-bill', { s3Key: presign.s3Key })
        const pick = (n: string) => ai.fields.find(f => f.name === n)?.candidates?.[0]?.value
        setPreview([{ kWh: pick('kWh'), date: pick('date'), site: pick('site') }])
        setMapResp({ mapping: { kWh: 'kWh', date: 'date', site: 'site' }, confidence: 0.7 })
        setSelected({ kWh: 'kWh', date: 'date', site: 'site' })
        setStage('mapping')
      } catch {
        setPreview([{ note: 'Uploaded. OCR service not available; you can still save manually after mapping.' }])
        setStage('mapping')
      }
    }
  }

  async function confirmUpsert() {
    if (!preview.length) return
    setStage('confirm')
    const entityId = prompt('Enter Entity ID to assign facts to:') || ''
    if (!entityId) { alert('Entity ID required'); return }
    let ok = 0
    for (const row of preview) {
      const finalMap = { ...(mapResp?.mapping || {}), ...(selected || {}) }
      const value = Number(row[finalMap.kWh as keyof typeof row] ?? row.kWh)
      const ds = String(row[finalMap.date as keyof typeof row] ?? row.date ?? '').slice(0, 10)
      if (!value || !ds) continue
      const dt = new Date(ds)
      const pstart = new Date(dt.getFullYear(), Math.floor(dt.getMonth() / 3) * 3, 1)
      const pend = new Date(pstart.getFullYear(), pstart.getMonth() + 3, 0)
      try {
        await gql<{ upsertFact: string }>(UPSERT, {
          input: {
            entityId,
            metricCode: 'ELEC_KWH',
            periodStart: pstart.toISOString().slice(0, 10),
            periodEnd: pend.toISOString().slice(0, 10),
            value, unit: 'kWh',
            sourceType: file?.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'PDF',
            sourceRef: s3Key
          }
        })
        ok++
      } catch (e: any) {
        console.error('upsert failed for row', e?.message)
      }
    }
    alert(`Upserted ${ok} row(s). Now approve from the table.`)
    setStage('done')
    onUploaded?.()
  }
}

function Stage({ stage, preview, mapResp, selected, setSelected, onConfirm }: {
  stage: string, preview: any[], mapResp: MapResp | null, selected: { date?: string; kWh?: string; site?: string }, setSelected: (m: any) => void, onConfirm: () => void
}) {
  if (stage === 'idle') return null
  if (stage === 'presign' || stage === 'uploading' || stage === 'parsing') return <p>Working… {stage}</p>
  if (stage === 'mapping') return (
    <div>
      <h4>Preview</h4>
      <pre data-test="parse-preview" style={{ background: '#0f1630', padding: 8, borderRadius: 6, maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(preview.slice(0, 5), null, 2)}</pre>
      <div style={{ border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020', marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: '6px 0' }}>Column mapping</h4>
          <small>Confidence: {(mapResp && typeof mapResp.confidence === 'number' ? (mapResp.confidence * 100).toFixed(0) : '—')}%</small>
        </div>

        {(mapResp?.warnings && mapResp.warnings.length > 0) && (
          <div data-test="mapping-warnings" style={{ margin: '8px 0', padding: 8, border: '1px solid #442', background: '#2a1420', borderRadius: 8 }}>
            <b>Review suggested mapping:</b>
            <ul style={{ margin: '6px 0 0 18px' }}>
              {mapResp.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {(['date', 'kWh', 'site'] as const).map((key) => {
            const alts = (mapResp?.alternatives?.[key] || []) as Array<{ header: string; score: number }>
            const headers = Object.keys(preview[0] || {})
            return (
              <div key={key}>
                <label>Map <code>{key}</code> to</label>
                <select
                  data-test={`mapping-alt-${key}`}
                  value={selected[key] || ''}
                  onChange={e => setSelected((s: any) => ({ ...s, [key]: e.target.value }))}
                >
                  {mapResp?.mapping?.[key] && <option value={mapResp.mapping[key]}>{mapResp.mapping[key]} (suggested)</option>}
                  {alts.filter((a) => a.header !== mapResp?.mapping?.[key]).map((a) => (
                    <option key={a.header} value={a.header}>{a.header} ({Math.round(a.score * 100)}%)</option>
                  ))}
                  {headers
                    .filter((h) => h !== mapResp?.mapping?.[key] && !alts.some((a) => a.header === h))
                    .map(h => <option key={h} value={h}>{h}</option>)
                  }
                </select>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <button data-test="mapping-accept" onClick={onConfirm}>Continue</button>
        </div>
      </div>
    </div>
  )
  if (stage === 'confirm') return <p>Saving facts…</p>
  if (stage === 'done') return <p>Done. Close the modal to continue.</p>
  return null
}

async function parseCSV(file: File): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r: any) => resolve(r.data as any[]),
      error: reject,
    })
  })
}

function modalStyle() { return { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50 } }
function cardStyle() { return { background: '#0b1020', border: '1px solid #223', padding: 16, borderRadius: 10, width: 720, maxWidth: '95vw' } }
