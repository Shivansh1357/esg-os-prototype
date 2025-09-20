'use client'
import { useState } from 'react'
import { postJSON } from '@/lib/api'

export default function EvidenceAttachModal({
  onClose,
  onDone
}: {
  onClose: () => void
  onDone: (evidenceUrl: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <div style={backdrop()}>
      <div style={card()}>
        <h3 style={{ marginTop: 0 }}>Attach evidence</h3>
        <p style={{ opacity: 0.8, marginTop: -8 }}>Upload a PDF/image (max 25 MB). It will be stored and the rule will flip to <b>PASS</b>.</p>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {err && <div style={{ color: '#ff8d8d', marginTop: 8 }}>{err}</div>}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button data-test="attach-evidence" onClick={handleUpload} disabled={!file || busy}>
            {busy ? 'Uploading…' : 'Upload & Attach'}
          </button>
        </div>
      </div>
    </div>
  )

  async function handleUpload() {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      // 1) Ask backend for presigned POST
      const presign = await postJSON<{ s3Key: string; post: { url: string; fields: Record<string, string> } }>(
        '/upload',
        { filename: file.name, contentType: file.type || 'application/octet-stream' }
      )

      // 2) Upload to S3/MinIO
      const fd = new FormData()
      Object.entries(presign.post.fields).forEach(([k, v]) => fd.append(k, v))
      fd.append('Content-Type', file.type || 'application/octet-stream')
      fd.append('file', file)
      const res = await fetch(presign.post.url, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')

      // 3) Compose evidence URL
      const s3Key = presign.s3Key
      const evidenceUrl = /^s3:\/\//.test(s3Key) || /^https?:\/\//.test(s3Key)
        ? s3Key
        : `s3://uploads/${s3Key}`

      onDone(evidenceUrl)
    } catch (e: any) {
      setErr(e?.message || 'Upload error')
      setBusy(false)
    }
  }
}

function backdrop() { return { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50 } }
function card() { return { background: '#0b1020', border: '1px solid #223', padding: 16, borderRadius: 10, width: 520, maxWidth: '95vw' } }


