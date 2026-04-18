const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const upstream = await fetch(`${AI_URL}/narrative/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: body.template || 'BRSR',
        section: body.section || 'EMISSIONS',
        periodStart: body.periodStart || '',
        periodEnd: body.periodEnd || '',
        kpis: body.kpis || {},
        tone: body.tone || 'neutral',
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
    const body = await request.clone().json().catch(() => ({}))
    const ps = body?.periodStart || '—'
    const pe = body?.periodEnd || '—'

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
