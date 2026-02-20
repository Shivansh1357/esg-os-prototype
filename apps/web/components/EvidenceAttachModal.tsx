'use client'

import { useState } from 'react'
import { postJSON } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Attach evidence</DialogTitle>
          <DialogDescription>
            Upload a PDF/image (max 25 MB). It will be stored and the rule will flip to <b>PASS</b>.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {err ? <div className="text-sm text-destructive">{err}</div> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button data-test="attach-evidence" onClick={handleUpload} disabled={!file || busy}>
            {busy ? 'Uploading…' : 'Upload & Attach'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  async function handleUpload() {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const presign = await postJSON<{ s3Key: string; post: { url: string; fields: Record<string, string> } }>(
        '/upload',
        { filename: file.name, contentType: file.type || 'application/octet-stream' }
      )

      const fd = new FormData()
      Object.entries(presign.post.fields).forEach(([k, v]) => fd.append(k, v))
      fd.append('Content-Type', file.type || 'application/octet-stream')
      fd.append('file', file)
      const res = await fetch(presign.post.url, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')

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
