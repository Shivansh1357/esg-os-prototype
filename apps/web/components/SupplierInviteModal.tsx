'use client'

import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableShell } from '@/components/product'

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[86vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite suppliers</DialogTitle>
          <DialogDescription>
            Import CSV or add rows, then send invites for <b>{periodStart}</b> → <b>{periodEnd}</b>.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Import CSV</Label>
                <Input type="file" accept=".csv" ref={fileRef} onChange={handleCSV} />
                <small className="block text-xs text-muted-foreground">
                  CSV headers: <code>name,email,category,spend</code>.{' '}
                  <button type="button" className="underline" onClick={()=>downloadCSV(csvTemplate)}>Download template</button>
                </small>
              </div>
              <div className="space-y-2">
                <Label>Add row</Label>
                <InlineAdd onAdd={(r)=> setRows(prev=>[...prev, r])} />
              </div>
            </div>

            <DataTableShell className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Category</TableHead><TableHead>Spend</TableHead><TableHead>&nbsp;</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r,i)=>(
                    <TableRow key={i}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{fmt(r.spend)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={()=> setRows(rs=> rs.filter((_,idx)=>idx!==i))}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length===0 && (
                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No rows yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </DataTableShell>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
              <Button data-test="invite-suppliers" onClick={sendInvites} disabled={busy || rows.length===0}>
                {busy ? 'Inviting…' : `Invite ${rows.length} supplier(s)`}
              </Button>
              {err ? <span className="text-sm text-destructive">{err}</span> : null}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm"><b>{result.count}</b> invite(s) created:</p>
            <DataTableShell>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Email</TableHead><TableHead>Link</TableHead><TableHead>Expires</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {result.invites.map((i)=>(
                    <TableRow key={i.supplierId}>
                      <TableCell>{i.email}</TableCell>
                      <TableCell className="max-w-[420px] truncate">
                        <a href={i.url} target="_blank" rel="noreferrer">{i.url}</a>
                      </TableCell>
                      <TableCell>{new Date(i.expiresAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={()=> setResult(null)}>Back</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
          ...(process.env.NEXT_PUBLIC_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_AUTH_TOKEN}` } : {}),
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
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
      <Input placeholder="email@example.com" value={email} onChange={e=>setEmail(e.target.value)} />
      <Input placeholder="Category" value={category} onChange={e=>setCategory(e.target.value)} />
      <Input placeholder="100000" value={spend} onChange={e=>setSpend(Number(e.target.value||0))} />
      <Button onClick={()=>{ if(!email) return; onAdd({ name, email, category, spend }); setName(''); setEmail(''); setSpend(0) }}>Add</Button>
    </div>
  )
}

async function parseCSV(file: File): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r: any) => resolve(r.data as any[]), error: reject })
  })
}

function fmt(n:number){ try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:0}).format(n) }catch{ return String(n)} }
function downloadCSV(text:string){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'})); a.download='suppliers_template.csv'; a.click(); URL.revokeObjectURL(a.href) }
