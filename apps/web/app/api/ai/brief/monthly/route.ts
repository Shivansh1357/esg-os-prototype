const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'
type BriefRequestBody = {
  template?: unknown
  section?: unknown
  periodStart?: unknown
  periodEnd?: unknown
  kpis?: unknown
  tone?: unknown
}

export async function POST(request: Request) {
  let body: BriefRequestBody = {}
  try {
    body = (await request.json()) as BriefRequestBody
  } catch {
    body = {}
  }

  try {
    const upstream = await fetch(`${AI_URL}/narrative/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: typeof body.template === 'string' ? body.template : 'BRSR',
        section: typeof body.section === 'string' ? body.section : 'EMISSIONS',
        periodStart: typeof body.periodStart === 'string' ? body.periodStart : '',
        periodEnd: typeof body.periodEnd === 'string' ? body.periodEnd : '',
        kpis: body.kpis && typeof body.kpis === 'object' ? body.kpis : {},
        tone: typeof body.tone === 'string' ? body.tone : 'neutral',
      }),
    })

    if (!upstream.ok) {
      throw new Error(`AI service returned ${upstream.status}`)
    }

    const data = await upstream.json()
    // Transform narrative response to bullets format for backward compatibility
    const bullets = data.text
      ? data.text.split('. ').filter((s: string) => s.trim().length > 10).slice(0, 5).map((s: string) => s.trim() + '.')
      : []

    return Response.json({ bullets, text: data.text, citations: data.citations || [] })
  } catch {
    // Fallback: static bullets when AI service is unavailable
    const ps = typeof body.periodStart === 'string' && body.periodStart ? body.periodStart : '—'
    const pe = typeof body.periodEnd === 'string' && body.periodEnd ? body.periodEnd : '—'

    return Response.json({
      bullets: [
        `Emissions snapshot for ${ps} → ${pe} generated from current KPIs.`,
        'Focus top movers: check Scope 2 market-based deltas and facility-level drivers.',
        'Close compliance gaps & increase supplier response rate for better Scope 3 coverage.',
      ],
      text: '',
      citations: [],
      fallback_used: true,
    })
  }
}
