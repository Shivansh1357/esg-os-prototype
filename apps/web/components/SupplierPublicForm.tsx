'use client'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

const t = {
  en: {
    title: 'Supplier Emissions Submission',
    intro: 'Please provide emissions for the period and (optionally) attach evidence. Your link is personal—do not share.',
    name: 'Supplier', category: 'Category', spend: 'Spend',
    period: 'Reporting period', emissions: 'Emissions (kgCO₂e)', evidence: 'Attach evidence (PDF/Image, max 25MB)',
    method: 'Method/Notes (optional)', submit: 'Submit', thanks: 'Thank you! Your response has been recorded.',
    upload: 'Upload…', uploading: 'Uploading…'
  },
  hi: {
    title: 'आपूर्तिकर्ता उत्सर्जन सबमिशन',
    intro: 'कृपया इस अवधि के लिए उत्सर्जन दें और (वैकल्पिक) साक्ष्य संलग्न करें। यह लिंक व्यक्तिगत है—कृपया साझा न करें।',
    name: 'आपूर्तिकर्ता', category: 'श्रेणी', spend: 'व्यय',
    period: 'रिपोर्टिंग अवधि', emissions: 'उत्सर्जन (किलो CO₂e)', evidence: 'साक्ष्य संलग्न करें (PDF/इमेज, अधिकतम 25MB)',
    method: 'विधि/नोट्स (वैकल्पिक)', submit: 'जमा करें', thanks: 'धन्यवाद! आपका उत्तर रिकॉर्ड हो गया है।',
    upload: 'अपलोड…', uploading: 'अपलोड हो रहा है…'
  }
}

export default function SupplierPublicForm({ token }: { token: string }) {
  const [lang, setLang] = useState<'en'|'hi'>('en')
  const L = useMemo(()=> t[lang], [lang])

  const [info, setInfo] = useState<{ supplier:{ name:string; email:string; category:string; spend:number }; periodStart:string; periodEnd:string }|null>(null)
  const [emissions, setEmissions] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')
  const [tier, setTier] = useState<'PRIMARY'|'SECONDARY'|'ESTIMATED'>('PRIMARY')
  const [evidenceFile, setEvidenceFile] = useState<File|null>(null)
  const [evidenceUrl, setEvidenceUrl] = useState<string| null>(null)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string| null>(null)

  useEffect(()=> {
    ;(async ()=>{
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s/${token}`)
        if (!r.ok) throw new Error(await r.text())
        const j = await r.json()
        setInfo(j)
      } catch (e:any) {
        setErr(e?.message || 'Invalid or expired link')
      }
    })()
  }, [token])

  async function uploadEvidence(){
    if (!evidenceFile) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type':'application/json' },
        body: JSON.stringify({ filename: evidenceFile.name, contentType: evidenceFile.type || 'application/octet-stream' })
      })
      if (!r.ok) throw new Error(await r.text())
      const presign = await r.json() as { s3Key: string; post:{ url:string; fields:Record<string,string> } }

      const fd = new FormData()
      Object.entries(presign.post.fields).forEach(([k,v])=>fd.append(k,v))
      fd.append('Content-Type', evidenceFile.type || 'application/octet-stream')
      fd.append('file', evidenceFile)
      const upl = await fetch(presign.post.url, { method:'POST', body: fd })
      if (!upl.ok) throw new Error('Upload failed')

      const url = /^s3:\/\//.test(presign.s3Key) || /^https?:\/\//.test(presign.s3Key)
        ? presign.s3Key
        : `s3://uploads/${presign.s3Key}`
      setEvidenceUrl(url)
    } catch(e:any){
      setErr(e?.message || 'Upload error')
    } finally {
      setBusy(false)
    }
  }

  async function submit(){
    setBusy(true); setErr(null)
    try{
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s/${token}`, {
        method: 'POST', headers: { 'content-type':'application/json' },
        body: JSON.stringify({
          emissionsKgCO2e: emissions || null,
          evidenceUrl: evidenceUrl || null,
          category: info?.supplier.category ?? null,
          dataQualityTier: tier,
          activity: { method: notes || '' }
        })
      })
      if (!r.ok) throw new Error(await r.text())
      setOk(true)
    } catch(e:any) {
      setErr(e?.message || 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  if (ok) return (
    <Container>
      <LangSwitcher lang={lang} setLang={setLang} />
      <Card className="glass-card border-success/40">
        <CardContent className="pt-6">
          <h2 className="font-heading text-2xl font-semibold">{L.thanks}</h2>
        </CardContent>
      </Card>
    </Container>
  )

  return (
    <Container>
      <LangSwitcher lang={lang} setLang={setLang} />
      <h2 className="font-heading text-3xl font-semibold tracking-tight">{L.title}</h2>
      {err && <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
      {!info ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : (
        <>
          <Box>
            <p className="mb-3 text-sm text-muted-foreground">{L.intro}</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label={L.name}><b>{info.supplier.name}</b></Field>
              <Field label={L.category}>{info.supplier.category}</Field>
              <Field label={L.spend}>{fmt(info.supplier.spend)}</Field>
              <Field label={L.period}><code>{info.periodStart} → {info.periodEnd}</code></Field>
            </div>
          </Box>

          <Box>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{L.emissions}</Label>
                <Input type="number" value={String(emissions)} onChange={e=>setEmissions(Number(e.target.value||0))} />
              </div>
              <div className="space-y-2">
                <Label>Data quality tier</Label>
                <Select value={tier} onValueChange={(v) => setTier(v as 'PRIMARY'|'SECONDARY'|'ESTIMATED')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRIMARY">PRIMARY</SelectItem>
                    <SelectItem value="SECONDARY">SECONDARY</SelectItem>
                    <SelectItem value="ESTIMATED">ESTIMATED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Label>{L.evidence}</Label>
              <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e)=>setEvidenceFile(e.target.files?.[0]||null)} />
              <div className="flex items-center gap-2">
                <Button onClick={uploadEvidence} disabled={!evidenceFile || busy}>{busy ? L.uploading : L.upload}</Button>
                {evidenceUrl ? <Badge variant="secondary">Attached</Badge> : null}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Label>{L.method}</Label>
              <Textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
            <div className="mt-3">
              <Button data-test="supplier-submit" onClick={submit} disabled={busy}>{L.submit}</Button>
            </div>
          </Box>
        </>
      )}
    </Container>
  )
}

function Container({ children }:{ children:React.ReactNode }) {
  return <div className="mx-auto mt-8 max-w-4xl px-4 text-foreground">{children}</div>
}
function Box({ children }:{ children:React.ReactNode }) {
  return (
    <Card className="glass-card mt-3">
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  )
}
function Field({ label, children }:{ label:string; children:React.ReactNode }) {
  return <div><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1">{children}</div></div>
}
function LangSwitcher({ lang, setLang }:{ lang:'en'|'hi'; setLang:(l:'en'|'hi')=>void }) {
  return (
    <div className="mb-3 flex justify-end gap-2">
      <Button variant={lang==='en' ? 'default' : 'outline'} size="sm" onClick={()=>setLang('en')} disabled={lang==='en'}>English</Button>
      <Button variant={lang==='hi' ? 'default' : 'outline'} size="sm" onClick={()=>setLang('hi')} disabled={lang==='hi'}>हिन्दी</Button>
    </div>
  )
}
function fmt(n:number){ try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:0}).format(n) }catch{ return String(n)} }
