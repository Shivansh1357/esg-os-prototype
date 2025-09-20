export async function POST(request: Request) {
  const body = await request.json().catch(()=>({}))
  const headers = body?.headers ?? []
  const lc = (s:string)=> String(s||'').toLowerCase()
  const mapping:any = { date: headers.find((h:string)=>lc(h).includes('date')) || 'date',
                        kWh: headers.find((h:string)=>lc(h).includes('kwh')||lc(h).includes('consumption')||lc(h).includes('usage')) || 'kWh',
                        site: headers.find((h:string)=>lc(h).includes('site')||lc(h).includes('location')) || '' }
  return new Response(JSON.stringify({ mapping, confidence: 0.66 }), { headers: { 'Content-Type':'application/json' } })
}


