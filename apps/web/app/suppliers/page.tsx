'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getJSON } from '@/lib/api'
import SupplierInviteModal from '@/components/SupplierInviteModal'

type ByCat = { category: string; suppliers: number; spend: number; emissions_kgco2e: number }
type Coverage = {
  invited: number; responded: number;
  spendTotal: number; spendCovered: number; coveragePercent: number;
  byCategory: ByCat[];
}

export default function SuppliersPage() {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('qstart') : null) || todayISO())
  const { ps, pe } = useMemo(()=> quarterRange(date), [date])

  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['suppliers-coverage', ps, pe],
    queryFn: async ()=> await getJSON<Coverage>(`/suppliers/coverage?periodStart=${ps}&periodEnd=${pe}`)
  })

  useEffect(()=>{
    const id = setInterval(()=> qc.invalidateQueries({ queryKey:['suppliers-coverage', ps, pe] }), 10000)
    return ()=> clearInterval(id)
  }, [ps, pe, qc])

  const cov = q.data

  return (
    <div>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:12 }}>
        <div>
          <h2 style={{ fontSize:18, marginBottom:6 }}>Suppliers (Scope 3 Lite)</h2>
          <small>Invite suppliers to submit emissions; track coverage by spend & category.</small>
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
          <button onClick={()=>setOpen(true)}>Invite suppliers</button>
        </div>
      </header>

      <section style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(3, minmax(220px,1fr))', gap:12 }}>
        <Card label="Invited" value={cov?.invited ?? 0} />
        <Card label="Responded" value={cov?.responded ?? 0} />
        <Card label="Coverage by spend" value={`${(cov?.coveragePercent ?? 0).toFixed(2)}%`} />
      </section>

      <section style={{ marginTop:16 }}>
        <h3 style={{ marginTop:0 }}>Coverage</h3>
        <Progress value={cov?.coveragePercent ?? 0} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Box>
            <div style={{ fontSize:12, opacity:0.8, marginBottom:6 }}>Spend</div>
            <div>Covered: <b>{fmt(cov?.spendCovered ?? 0)}</b> / Total: <b>{fmt(cov?.spendTotal ?? 0)}</b></div>
          </Box>
          <Box>
            <div style={{ fontSize:12, opacity:0.8, marginBottom:6 }}>Suppliers</div>
            <div>Responded: <b>{cov?.responded ?? 0}</b> / Invited: <b>{cov?.invited ?? 0}</b></div>
          </Box>
        </div>
      </section>

      <section style={{ marginTop:16 }}>
        <h3 style={{ marginTop:0 }}>By Category</h3>
        <div style={{ overflowX:'auto', border:'1px solid #223', borderRadius:8 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <Th>Category</Th><Th>Responded suppliers</Th><Th>Spend</Th><Th>Reported Emissions</Th>
            </tr></thead>
            <tbody>
              {(cov?.byCategory ?? []).map((r)=> (
                <tr key={r.category}>
                  <Td>{r.category}</Td>
                  <Td>{r.suppliers}</Td>
                  <Td>{fmt(r.spend)}</Td>
                  <Td>{fmt(r.emissions_kgco2e)}</Td>
                </tr>
              ))}
              {(!cov || cov.byCategory.length===0) && <tr><Td colSpan={4} style={{ textAlign:'center', padding:12, opacity:0.7 }}>No data yet.</Td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {open && <SupplierInviteModal periodStart={ps} periodEnd={pe} onClose={()=>setOpen(false)} />}
    </div>
  )
}

function Card({ label, value }:{ label:string; value:number|string }) {
  return <Box><div style={{ fontSize:12, opacity:0.8 }}>{label}</div><div style={{ fontSize:24, fontWeight:600 }}>{value}</div></Box>
}
function Progress({ value }:{ value:number }) {
  const v = Math.max(0, Math.min(100, value||0))
  return (
    <div style={{ border:'1px solid #223', borderRadius:999, overflow:'hidden', height:12, background:'#11182f' }}>
      <div style={{ width:`${v}%`, height:'100%', background:'#27c084' }} />
    </div>
  )
}
function Box({ children }:{ children:React.ReactNode }) {
  return <div style={{ border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020' }}>{children}</div>
}
function Th({children}:{children:React.ReactNode}){ return <th style={{ textAlign:'left', padding:8, background:'#11182f', borderBottom:'1px solid #223' }}>{children}</th>}
function Td({children, colSpan, style}:{children:React.ReactNode; colSpan?:number; style?: React.CSSProperties}){ return <td colSpan={colSpan} style={{ padding:8, borderBottom:'1px solid #223', ...(style||{}) }}>{children}</td> }
function iso(d: Date) { return d.toISOString().slice(0,10) }
function todayISO(){ return iso(new Date()) }
function toQuarterStart(s: string){ const d=new Date(s); const qs=new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1); return iso(qs) }
function quarterRange(date:string){ const d=new Date(date); const qs=new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1); const qe=new Date(qs.getFullYear(), qs.getMonth()+3, 0); return { ps: iso(qs), pe: iso(qe) } }
function fmt(n:number){ try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:0}).format(n) }catch{ return String(n)} }


