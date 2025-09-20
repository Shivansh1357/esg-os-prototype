'use client'

import { useEffect, useMemo, useState } from 'react'
import { getJSON } from '@/lib/api'

type KPIs = {
  totals: { s1:number; s2_loc:number; s2_mkt:number; s3:number }
  yoy: {
    prevStart: string; prevEnd: string;
    totals: { s1:number; s2_loc:number; s2_mkt:number; s3:number };
    deltaPct: { s1:number|null; s2_loc:number|null; s2_mkt:number|null; s3:number|null }
  }
  completeness: { pass:number; fail:number; risk:number; total:number; percent:number }
  suppliers: { invited:number; responded:number; spendTotal:number; spendCovered:number; coveragePercent:number }
  approvedFacts: number
  factorSet?: { id?:string; code?:string; version?:string }
  at?: string
}

export default function ExecPage() {
  const [date, setDate] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || todayISO())
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [brief, setBrief] = useState<{ bullets:string[]; generatedAt:string }|null>(null)
  const [busyBrief, setBusyBrief] = useState(false)

  const { ps, pe } = useMemo(()=> quarterRange(date), [date])

  useEffect(()=> { if (typeof window !== 'undefined') localStorage.setItem('qstart', date) }, [date])

  useEffect(() => {
    (async () => {
      setError(null); setKpis(null)
      try {
        const j = await getJSON<KPIs>(`/exec/summary?periodStart=${ps}&periodEnd=${pe}`)
        setKpis(j)
      } catch (e:any) {
        setError('Exec summary endpoint not available. Enable Backend D8 /exec/summary to power this page.')
      }
    })()
  }, [ps, pe])

  async function generateBrief() {
    if (!kpis) return
    setBusyBrief(true); setError(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/brief/monthly`, {
        method:'POST',
        headers: {
          'content-type':'application/json',
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
        },
        body: JSON.stringify({ periodStart: ps, periodEnd: pe, kpis })
      })
      if (r.ok) {
        const j = await r.json() as { bullets: string[] }
        setBrief({ bullets: j.bullets ?? [], generatedAt: new Date().toISOString() })
      } else {
        setBrief({ bullets: localBrief(kpis, ps, pe), generatedAt: new Date().toISOString() })
      }
    } catch {
      setBrief({ bullets: localBrief(kpis, ps, pe), generatedAt: new Date().toISOString() })
    } finally {
      setBusyBrief(false)
    }
  }

  return (
    <div>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:12 }}>
        <div>
          <h2 style={{ fontSize:18, marginBottom:6 }}>Executive Cockpit</h2>
          <small>Fast, single-call KPIs. Generate a monthly brief for leadership.</small>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div>
            <label>Quarter start</label>
            <input type="date" value={toQuarterStart(date)} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <label>Period</label>
            <div style={{ padding:8, border:'1px solid #233', borderRadius:8 }}>{ps} → {pe}</div>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ marginTop:12, padding:10, border:'1px solid #442222', background:'#2a1420', borderRadius:8 }}>
          {error}
        </div>
      )}

      {kpis && (
        <>
          <section style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(4, minmax(220px,1fr))', gap:12 }}>
            <Tile label="Scope 1" value={fmt(kpis.totals.s1)} unit="kgCO₂e" />
            <Tile label="Scope 2 (loc)" value={fmt(kpis.totals.s2_loc)} unit="kgCO₂e" />
            <Tile label="Scope 2 (mkt)" value={fmt(kpis.totals.s2_mkt)} unit="kgCO₂e" />
            <Tile label="Scope 3" value={fmt(kpis.totals.s3)} unit="kgCO₂e" />

            <DeltaTile label="Δ S1 vs prev" deltaPct={kpis.yoy.deltaPct.s1} />
            <DeltaTile label="Δ S2 (loc)" deltaPct={kpis.yoy.deltaPct.s2_loc} />
            <DeltaTile label="Δ S2 (mkt)" deltaPct={kpis.yoy.deltaPct.s2_mkt} />
            <DeltaTile label="Δ S3 vs prev" deltaPct={kpis.yoy.deltaPct.s3} />

            <Tile label="Compliance completeness" value={`${(kpis.completeness.percent||0).toFixed(0)}%`} hint={`${kpis.completeness.pass}/${kpis.completeness.total} PASS`} />
            <Tile label="Findings — FAIL" value={kpis.completeness.fail} tone="bad" />
            <Tile label="Supplier coverage" value={`${(kpis.suppliers.coveragePercent||0).toFixed(0)}%`} hint={`${kpis.suppliers.responded}/${kpis.suppliers.invited} responded`} />
            <Tile label="Approved facts" value={kpis.approvedFacts} />
          </section>

          <section style={{ marginTop:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, opacity:0.8 }}>
              Factor set: <b>{kpis.factorSet?.code || 'Default'}</b>{kpis.factorSet?.version ? ` v${kpis.factorSet.version}` : ''} •{' '}
              Prev qtr: {kpis.yoy.prevStart} → {kpis.yoy.prevEnd}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button data-test="generate-brief" onClick={generateBrief} disabled={busyBrief}>
                {busyBrief ? 'Generating…' : 'Generate Brief'}
              </button>
            </div>
          </section>

          {brief && (
            <section style={{ marginTop:12, border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <h3 style={{ marginTop:0 }}>Monthly Brief</h3>
                <small style={{ opacity:0.7 }}>Generated at {new Date(brief.generatedAt).toLocaleString()}</small>
              </div>
              <ul style={{ margin:'6px 0 0 18px' }}>
                {brief.bullets.map((b,i)=><li key={i}>{b}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ label, value, unit, hint, tone }: { label:string; value:any; unit?:string; hint?:string; tone?:'good'|'bad'|undefined }) {
  const border = tone==='bad' ? '#3a0b0b' : tone==='good' ? '#0d2f21' : '#223'
  return (
    <div style={{ border:`1px solid ${border}`, borderRadius:10, padding:12, background:'#0b1020' }}>
      <div style={{ fontSize:12, opacity:0.8 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:600, marginTop:6 }}>
        {value} {unit ? <span style={{ fontSize:12 }}>{unit}</span> : null}
      </div>
      {hint && <div style={{ fontSize:12, opacity:0.8, marginTop:4 }}>{hint}</div>}
    </div>
  )
}

function DeltaTile({ label, deltaPct }: { label:string; deltaPct:number|null }) {
  const good = typeof deltaPct === 'number' ? deltaPct <= 0 : false
  const color = typeof deltaPct === 'number' ? (good ? '#5fcf65' : '#ff7474') : '#aaa'
  const text = typeof deltaPct === 'number' ? `${deltaPct>0?'▲':deltaPct<0?'▼':''} ${Math.abs(deltaPct).toFixed(2)}%` : '—'
  return (
    <div style={{ border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020' }}>
      <div style={{ fontSize:12, opacity:0.8 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:600, marginTop:6, color }}>{text}</div>
      <div style={{ fontSize:12, opacity:0.8, marginTop:4 }}>vs previous quarter</div>
    </div>
  )
}

function iso(d: Date) { return d.toISOString().slice(0,10) }
function todayISO(){ return iso(new Date()) }
function toQuarterStart(s: string){ const d=new Date(s); const qs=new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1); return iso(qs) }
function quarterRange(date:string){ const d=new Date(date); const qs=new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1); const qe=new Date(qs.getFullYear(), qs.getMonth()+3, 0); return { ps: iso(qs), pe: iso(qe) } }
function fmt(n:number){ try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:2}).format(n) } catch { return String(n) } }

function localBrief(k: KPIs, ps:string, pe:string): string[] {
  const ups = (x:number|null)=> typeof x==='number' && x>0
  const downs = (x:number|null)=> typeof x==='number' && x<0
  const hot = ['s1','s2_loc','s2_mkt','s3'].filter((kpi)=>ups((k.yoy.deltaPct as any)[kpi])).map(x=>x.toUpperCase().replace('_',' '))
  const cool = ['s1','s2_loc','s2_mkt','s3'].filter((kpi)=>downs((k.yoy.deltaPct as any)[kpi])).map(x=>x.toUpperCase().replace('_',' '))
  const bullets:string[] = []
  bullets.push(`Emissions for ${ps} → ${pe}: S1 ${fmt(k.totals.s1)}, S2(loc) ${fmt(k.totals.s2_loc)}, S2(mkt) ${fmt(k.totals.s2_mkt)}, S3 ${fmt(k.totals.s3)}.`)
  if (hot.length) bullets.push(`Increases vs prev qtr in ${hot.join(', ')} — investigate drivers and recent operational changes.`)
  if (cool.length) bullets.push(`Reductions vs prev qtr in ${cool.join(', ')} — sustain measures and document learnings.`)
  bullets.push(`Compliance ${k.completeness.percent.toFixed(0)}% complete (${k.completeness.pass}/${k.completeness.total} PASS); ${k.completeness.fail} FAIL, ${k.completeness.risk} RISK.`)
  bullets.push(`Supplier coverage at ${(k.suppliers.coveragePercent||0).toFixed(0)}% by spend (${k.suppliers.responded}/${k.suppliers.invited} responded); follow up with non-responders.`)
  return bullets.slice(0,3)
}


