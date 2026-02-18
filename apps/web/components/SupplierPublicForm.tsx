'use client'
import { useEffect, useMemo, useState } from 'react'

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
    (async ()=>{
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
      <h2>{L.thanks}</h2>
    </Container>
  )

  return (
    <Container>
      <LangSwitcher lang={lang} setLang={setLang} />
      <h2>{L.title}</h2>
      {err && <div style={{ color:'#ff8d8d' }}>{err}</div>}
      {!info ? <p style={{ opacity:0.7 }}>Loading…</p> : (
        <>
          <Box>
            <p style={{ marginTop:0, opacity:0.9 }}>{L.intro}</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
              <Field label={L.name}><b>{info.supplier.name}</b></Field>
              <Field label={L.category}>{info.supplier.category}</Field>
              <Field label={L.spend}>{fmt(info.supplier.spend)}</Field>
              <Field label={L.period}><code>{info.periodStart} → {info.periodEnd}</code></Field>
            </div>
          </Box>

          <Box>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label>{L.emissions}</label>
                <input type="number" value={String(emissions)} onChange={e=>setEmissions(Number(e.target.value||0))} />
              </div>
              <div>
                <label>Data quality tier</label>
                <select value={tier} onChange={(e)=>setTier(e.target.value as 'PRIMARY'|'SECONDARY'|'ESTIMATED')}>
                  <option value="PRIMARY">PRIMARY</option>
                  <option value="SECONDARY">SECONDARY</option>
                  <option value="ESTIMATED">ESTIMATED</option>
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, marginTop:12 }}>
              <div>
                <label>{L.evidence}</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e)=>setEvidenceFile(e.target.files?.[0]||null)} />
                <div style={{ marginTop:8, display:'flex', gap:8 }}>
                  <button onClick={uploadEvidence} disabled={!evidenceFile || busy}>{busy ? L.uploading : L.upload}</button>
                  {evidenceUrl && <span style={{ fontSize:12, opacity:0.8 }}>Attached</span>}
                </div>
              </div>
            </div>
            <div style={{ marginTop:12 }}>
              <label>{L.method}</label>
              <textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
            <div style={{ marginTop:12 }}>
              <button data-test="supplier-submit" onClick={submit} disabled={busy}>{L.submit}</button>
            </div>
          </Box>
        </>
      )}
    </Container>
  )
}

/* ---- UI helpers ---- */
function Container({ children }:{ children:React.ReactNode }) {
  return <div style={{ maxWidth:760, margin:'24px auto', padding:'0 16px', color:'#eaeefb', fontFamily:'Inter, system-ui, sans-serif' }}>{children}</div>
}
function Box({ children }:{ children:React.ReactNode }) {
  return <div style={{ border:'1px solid #223', borderRadius:10, padding:12, background:'#0b1020', marginTop:12 }}>{children}</div>
}
function Field({ label, children }:{ label:string; children:React.ReactNode }) {
  return <div><div style={{ fontSize:12, opacity:0.8 }}>{label}</div><div>{children}</div></div>
}
function LangSwitcher({ lang, setLang }:{ lang:'en'|'hi'; setLang:(l:'en'|'hi')=>void }) {
  return (
    <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginBottom:8 }}>
      <button onClick={()=>setLang('en')} disabled={lang==='en'}>English</button>
      <button onClick={()=>setLang('hi')} disabled={lang==='hi'}>हिन्दी</button>
    </div>
  )
}
function fmt(n:number){ try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:0}).format(n) }catch{ return String(n)} }


