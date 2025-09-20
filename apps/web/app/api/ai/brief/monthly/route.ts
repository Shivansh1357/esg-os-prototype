export async function POST(request: Request) {
  const body = await request.json().catch(()=>({}))
  const ps = body?.periodStart || '—'
  const pe = body?.periodEnd || '—'
  const bullets = [
    `Emissions snapshot for ${ps} → ${pe} generated from current KPIs.`,
    `Focus top movers: check Scope 2 market-based deltas and facility-level drivers.`,
    `Close compliance gaps & increase supplier response rate for better Scope 3 coverage.`
  ]
  return new Response(JSON.stringify({ bullets }), { headers:{ 'Content-Type':'application/json' } })
}


