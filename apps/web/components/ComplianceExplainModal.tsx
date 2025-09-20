'use client'
import { useEffect, useState } from 'react'
import { postAI } from '@/lib/api'

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
    (async () => {
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
    <div style={backdrop()}>
      <div style={card()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ marginTop:0 }}>Guidance — {finding.ruleCode}</h3>
          <button onClick={onClose}>Close</button>
        </div>
        {busy && <p style={{ opacity:0.8 }}>Loading…</p>}
        {err && <p style={{ color:'#ff8d8d' }}>{err}</p>}
        {!busy && !err && (
          <>
            <div style={{ marginTop:6 }}>
              <ul style={{ margin:'0 0 0 18px' }}>
                {bullets.map((b,i)=><li key={i}>{b}</li>)}
              </ul>
            </div>
            <div style={{ marginTop:12 }}>
              <h4 style={{ margin:'8px 0 4px' }}>Checklist</h4>
              <ul style={{ margin:'0 0 0 18px' }}>
                {checklist.map((c,i)=>(
                  <li key={i}>
                    <input type="checkbox" checked={c.done} readOnly style={{ marginRight:8 }} />
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function backdrop(){ return { position:'fixed' as const, inset:0, background:'rgba(0,0,0,0.5)', display:'grid', placeItems:'center', zIndex:50 } }
function card(){ return { background:'#0b1020', border:'1px solid #223', padding:16, borderRadius:10, width:700, maxWidth:'95vw' } }






