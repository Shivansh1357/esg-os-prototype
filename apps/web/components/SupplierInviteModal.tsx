'use client'
import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'

type Row = { name: string; email: string; category: string; spend: number }

export default function SupplierInviteModal({
  periodStart, periodEnd, onClose
}:{ periodStart: string; periodEnd: string; onClose: ()=>void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{count:number; invites:Array<{supplierId:string; email:string; url:string; expiresAt:string}>} | null>(null)
  const [err, setErr] = useState<string| null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const csvTemplate = useMemo(()=> 'name,email,category,spend\nAlpha Co,alpha@example.com,Purchased goods,100000\n', [])

  return (
    <div style={backdrop()}>
      <div style={card()}>
        <h3 style={{ marginTop: 0 }}>Invite suppliers</h3>
        <p style={{ marginTop:-8, opacity:0.8 }}>Import a CSV or add rows, then send invites for <b>{periodStart}</b> → <b>{periodEnd}</b>.</p>

        {!result && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label>Import CSV</label>
                <input type="file" accept=".csv" ref={fileRef} onChange={handleCSV} />
                <small style={{ display:'block', opacity:0.7, marginTop:6 }}>
                  CSV headers: <code>name,email,category,spend</code>. <button type="button" onClick={()=>downloadCSV(csvTemplate)}>Download template</button>
                </small>
              </div>
              <div>
                <label>Add row</label>
                <InlineAdd onAdd={(r)=> setRows(prev=>[...prev, r])} />
              </div>
            </div>

            <div style={{ marginTop:12, border:'1px solid #223', borderRadius:8, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr><Th>Name</Th><Th>Email</Th><Th>Category</Th><Th>Spend</Th><Th>&nbsp;</Th></tr></thead>
                <tbody>
                  {rows.map((r,i)=>(
                    <tr key={i}>
                      <Td>{r.name}</Td><Td>{r.email}</Td><Td>{r.category}</Td><Td>{fmt(r.spend)}</Td>
                      <Td><button onClick={()=> setRows(rs=> rs.filter((_,idx)=>idx!==i))}>Remove</button></Td>
                    </tr>
                  ))}
                  {rows.length===0 && <tr><Td colSpan={5} style={{ textAlign:'center', padding:12, opacity:0.7 }}>No rows yet.</Td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop:12, display:'flex', gap:8 }}>
              <button onClick={onClose} disabled={busy}>Close</button>
              <button data-test="invite-suppliers" onClick={sendInvites} disabled={busy || rows.length===0}>
                {busy ? 'Inviting…' : `Invite ${rows.length} supplier(s)`}
              </button>
              {err && <span style={{ color:'#ff8d8d' }}>{err}</span>}
            </div>
          </>
        )}

        {result && (
          <>
            <p><b>{result.count}</b> invite(s) created:</p>
            <div style={{ border:'1px solid #223', borderRadius:8, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr><Th>Email</Th><Th>Link</Th><Th>Expires</Th></tr></thead>
                <tbody>
                  {result.invites.map((i)=>(
                    <tr key={i.supplierId}>
                      <Td>{i.email}</Td>
                      <Td style={{ maxWidth:420, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        <a href={i.url} target="_blank" rel="noreferrer">{i.url}</a>
                      </Td>
                      <Td>{new Date(i.expiresAt).toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop:12 }}>
              <button onClick={()=> setResult(null)}>Back</button>
              <button onClick={onClose} style={{ marginLeft:8 }}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const parsed = await parseCSV(f)
    const lc = (s: any) => String(s ?? '').trim()
    const norm: Row[] = parsed.map((r: any) => ({
      name: lc(r.name),
      email: lc(r.email),
      category: lc(r.category) || 'Purchased goods',
      spend: Number(r.spend) || 0
    })).filter(r => r.email)
    setRows(curr => [...curr, ...norm])
  }

  async function sendInvites() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/suppliers/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': process.env.NEXT_PUBLIC_TENANT_ID!,
          'x-user-id': process.env.NEXT_PUBLIC_USER_ID!,
        },
        body: JSON.stringify({ periodStart, periodEnd, suppliers: rows })
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setResult(j)
    } catch (e:any) {
      setErr(e?.message || 'Invite failed')
    } finally {
      setBusy(false)
    }
  }
}

function InlineAdd({ onAdd }:{ onAdd:(r:any)=>void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [category, setCategory] = useState('Purchased goods'); const [spend, setSpend] = useState<number>(0)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:8 }}>
      <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
      <input placeholder="email@example.com" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="Category" value={category} onChange={e=>setCategory(e.target.value)} />
      <input placeholder="100000" value={spend} onChange={e=>setSpend(Number(e.target.value||0))} />
      <button onClick={()=>{ if(!email) return; onAdd({ name, email, category, spend }); setName(''); setEmail(''); setSpend(0) }}>Add</button>
    </div>
  )
}

async function parseCSV(file: File): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r: any) => resolve(r.data as any[]), error: reject })
  })
}

function backdrop(){ return { position:'fixed' as const, inset:0, background:'rgba(0,0,0,0.5)', display:'grid', placeItems:'center', zIndex:50 } }
function card(){ return { background:'#0b1020', border:'1px solid #223', padding:16, borderRadius:10, width:900, maxWidth:'95vw' } }
function Th({children}:{children:React.ReactNode}){ return <th style={{ textAlign:'left', padding:8, background:'#11182f', borderBottom:'1px solid #223' }}>{children}</th>}
function Td({children, colSpan, style}:{children:React.ReactNode; colSpan?:number; style?: React.CSSProperties}){ return <td colSpan={colSpan} style={{ padding:8, borderBottom:'1px solid #223', ...(style||{}) }}>{children}</td> }
function fmt(n:number){ try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:0}).format(n) }catch{ return String(n)} }
function downloadCSV(text:string){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'})); a.download='suppliers_template.csv'; a.click(); URL.revokeObjectURL(a.href) }


