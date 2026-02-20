'use client'

import { useEffect, useState } from 'react'
import { postAI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function ComplianceExplainModal({
  finding,
  period,
  onClose
}: {
  finding: { id: string; ruleCode: string; reason?: string }
  period: { ps: string; pe: string }
  onClose: () => void
}) {
  const [bullets, setBullets] = useState<string[]>([])
  const [checklist, setChecklist] = useState<Array<{label:string; done:boolean}>>([])
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setBusy(true); setErr(null)
      try {
        const res = await postAI<{ bullets: string[]; checklist: Array<{label:string; done:boolean}> }>(
          '/compliance/explain',
          {
            ruleCode: finding.ruleCode,
            periodStart: period.ps, periodEnd: period.pe,
            requiredFields: [], presentMetrics: [], missingMetrics: [],
            notes: finding.reason || ''
          }
        )
        setBullets(res.bullets || [])
        setChecklist(res.checklist || [])
      } catch (e:any) {
        setErr(e?.message || 'Failed to get guidance')
      } finally {
        setBusy(false)
      }
    })()
  }, [finding, period])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="flex flex-row items-center justify-between gap-2">
          <DialogTitle>Guidance — {finding.ruleCode}</DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogHeader>
        {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {!busy && !err && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-semibold">Recommendations</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Checklist</h4>
              <ul className="space-y-2">
                {checklist.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={c.done} readOnly className="size-4" />
                    <span>{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
