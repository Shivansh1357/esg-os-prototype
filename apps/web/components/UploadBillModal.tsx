"use client"

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { gql, postAI, postJSON } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type MapAlt = { header: string; score: number }
type MapResp = { mapping: Record<string, string>; confidence: number; alternatives?: Record<string, MapAlt[]>; warnings?: string[]; confidence_band?: string; fallback_used?: boolean }

const UPSERT = `
mutation U($input: UpsertFactInput!){ upsertFact(input:$input) }
`

type Props = { onUploaded?: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>
type Stage = 'idle' | 'presign' | 'uploading' | 'parsing' | 'mapping' | 'confirm' | 'done'

export default function UploadBillModal({ onUploaded, ...btn }: Props) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [preview, setPreview] = useState<any[]>([])
  const [mapResp, setMapResp] = useState<MapResp | null>(null)
  const [selected, setSelected] = useState<{ date?: string; kWh?: string; site?: string }>({})
  const [s3Key, setS3Key] = useState<string | undefined>(undefined)
  const [entityId, setEntityId] = useState('')
  const [ocrLang, setOcrLang] = useState<'eng' | 'hin' | 'eng+hin' | 'auto'>('eng')
  const [detecting, setDetecting] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const busy = stage !== 'idle' && stage !== 'mapping' && stage !== 'done'

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next)
      if (!next) reset()
    }}>
      <DialogTrigger asChild>
        <Button {...btn}>Upload</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Utility Bill / Energy CSV</DialogTitle>
          <DialogDescription>
            Upload source files, review mapping, and save draft facts for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="upload-file">Source file</Label>
              <Input
                id="upload-file"
                type="file"
                accept=".csv,.pdf,.xlsx,.xls"
                ref={ref}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label>OCR Language</Label>
              <Select
                value={ocrLang}
                onValueChange={(v) => setOcrLang(v as typeof ocrLang)}
              >
                <SelectTrigger data-test="ocr-lang-select" className="w-[150px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eng">English</SelectItem>
                  <SelectItem value="hin">Hindi</SelectItem>
                  <SelectItem value="eng+hin">English + Hindi</SelectItem>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button data-test="upload-bill-start-btn" onClick={handleGo} disabled={!file || stage !== 'idle' || detecting}>
              {detecting ? 'Detecting...' : 'Start'}
            </Button>
          </div>

          {stage !== 'idle' ? (
            <StagePanel
              stage={stage}
              preview={preview}
              mapResp={mapResp}
              selected={selected}
              setSelected={setSelected}
              entityId={entityId}
              setEntityId={setEntityId}
              onConfirm={confirmUpsert}
            />
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Stage: <b>{stage}</b>
          </p>
          <Button variant="ghost" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  async function resolveOcrLang(): Promise<'eng' | 'hin' | 'eng+hin'> {
    if (ocrLang !== 'auto') return ocrLang
    if (!file) return 'eng'
    try {
      setDetecting(true)
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch('/api/ai/ocr/detect-language', { method: 'POST', body: fd })
      if (!resp.ok) return 'eng'
      const data = await resp.json() as { language: string }
      const lang = data.language
      if (lang === 'hin' || lang === 'eng+hin') return lang
      return 'eng'
    } catch {
      return 'eng'
    } finally {
      setDetecting(false)
    }
  }

  async function handleGo() {
    if (!file) return

    // Resolve language before starting the pipeline
    const resolvedLang = await resolveOcrLang()

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
        if (resp.confidence_band === 'low' || resp.fallback_used) {
          toast.warning('AI confidence is low — please review mapping carefully.')
        }
      } catch {
        try {
          const resp = await postJSON<MapResp>('/ai/map/columns', { headers: Object.keys(rows[0] ?? {}) } as any)
          setMapResp(resp)
          setSelected(resp.mapping as any)
          toast.warning('AI service unavailable — using basic header matching. Review mapping carefully.')
        } catch {
          setMapResp(null)
        }
      }
    } else {
      try {
        const langParam = `?lang=${encodeURIComponent(resolvedLang)}`
        const ai = await postAI<{ fields: Array<{ name: string; candidates: Array<{ value: string; conf: number }> }>; lang: string }>(
          `/ocr/utility-bill${langParam}`, { s3Key: presign.s3Key })
        const pick = (n: string) => ai.fields.find(f => f.name === n)?.candidates?.[0]?.value
        setPreview([{ kWh: pick('kWh'), date: pick('date'), site: pick('site') }])
        setMapResp({ mapping: { kWh: 'kWh', date: 'date', site: 'site' }, confidence: 0.7 })
        setSelected({ kWh: 'kWh', date: 'date', site: 'site' })
        setStage('mapping')
        if (resolvedLang !== 'eng') {
          toast.info(`OCR ran with language: ${resolvedLang === 'hin' ? 'Hindi' : 'English + Hindi'}`)
        }
      } catch {
        setPreview([{ note: 'Uploaded. OCR service not available; you can still save manually after mapping.' }])
        setStage('mapping')
      }
    }
  }

  async function confirmUpsert() {
    if (!preview.length) return
    setStage('confirm')

    // Keep prompt fallback for e2e compatibility while allowing typed input.
    const fallbackPrompt = typeof window !== 'undefined' ? (window.prompt('Enter Entity ID to assign facts to:') || '') : ''
    const resolvedEntityId = (entityId || fallbackPrompt).trim()
    if (!resolvedEntityId) {
      toast.error('Entity ID required.')
      setStage('mapping')
      return
    }

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
            entityId: resolvedEntityId,
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

    toast.success(`Upserted ${ok} row(s). Now approve from the table.`)
    setStage('done')
    onUploaded?.()
  }

  function reset() {
    setFile(null)
    setStage('idle')
    setPreview([])
    setMapResp(null)
    setSelected({})
    setS3Key(undefined)
    setEntityId('')
    setOcrLang('eng')
    setDetecting(false)
  }
}

function StagePanel({ stage, preview, mapResp, selected, setSelected, entityId, setEntityId, onConfirm }: {
  stage: Stage
  preview: any[]
  mapResp: MapResp | null
  selected: { date?: string; kWh?: string; site?: string }
  setSelected: (m: any) => void
  entityId: string
  setEntityId: (value: string) => void
  onConfirm: () => void
}) {
  if (stage === 'presign' || stage === 'uploading' || stage === 'parsing') {
    return <p className="text-sm text-muted-foreground">Working… {stage}</p>
  }

  if (stage === 'mapping') {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Entity ID</Label>
          <Input
            placeholder="paste entity UUID"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          />
        </div>
        <div>
          <Label>Preview</Label>
          <pre data-test="parse-preview" className="max-h-48 overflow-auto rounded-lg border border-border/70 bg-muted/30 p-2 text-xs">{JSON.stringify(preview.slice(0, 5), null, 2)}</pre>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold">Column mapping</h4>
            <small className="text-xs text-muted-foreground">
              Confidence: {(mapResp && typeof mapResp.confidence === 'number' ? (mapResp.confidence * 100).toFixed(0) : '—')}%
            </small>
          </div>

          {(mapResp?.warnings && mapResp.warnings.length > 0) && (
            <div data-test="mapping-warnings" className="mb-2 rounded-lg border border-warning/40 bg-warning/15 p-2 text-sm">
              <b>Review suggested mapping:</b>
              <ul className="mt-1 list-disc pl-5">
                {mapResp.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {(['date', 'kWh', 'site'] as const).map((key) => {
              const alts = (mapResp?.alternatives?.[key] || []) as Array<{ header: string; score: number }>
              const headers = Object.keys(preview[0] || {})
              return (
                <div key={key} className="space-y-2">
                  <Label>Map <code>{key}</code> to</Label>
                  <Select
                    value={selected[key] || undefined}
                    onValueChange={(value) => setSelected((s: any) => ({ ...s, [key]: value }))}
                  >
                    <SelectTrigger data-test={`mapping-alt-${key}`}>
                      <SelectValue placeholder="Select header" />
                    </SelectTrigger>
                    <SelectContent>
                      {mapResp?.mapping?.[key] && (
                        <SelectItem value={mapResp.mapping[key]}>
                          {mapResp.mapping[key]} (suggested)
                        </SelectItem>
                      )}
                      {alts.filter((a) => a.header !== mapResp?.mapping?.[key]).map((a) => (
                        <SelectItem key={a.header} value={a.header}>
                          {a.header} ({Math.round(a.score * 100)}%)
                        </SelectItem>
                      ))}
                      {headers
                        .filter((h) => h !== mapResp?.mapping?.[key] && !alts.some((a) => a.header === h))
                        .map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
          <div className="mt-3">
            <Button data-test="mapping-accept" onClick={onConfirm}>Continue</Button>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'confirm') return <p className="text-sm text-muted-foreground">Saving facts…</p>
  if (stage === 'done') return <p className="text-sm text-success">Done. Close the modal to continue.</p>
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
