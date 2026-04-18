const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'
type MapColumnsRequestBody = {
  headers?: unknown
}

export async function POST(request: Request) {
  let body: MapColumnsRequestBody = {}
  try {
    body = (await request.json()) as MapColumnsRequestBody
  } catch {
    body = {}
  }

  try {
    const upstream = await fetch(`${AI_URL}/map/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!upstream.ok) {
      throw new Error(`AI service returned ${upstream.status}`)
    }

    const data = await upstream.json()
    return Response.json(data)
  } catch {
    // Fallback: naive header matching when AI service is unavailable
    const headers = Array.isArray(body.headers)
      ? body.headers.filter((header): header is string => typeof header === 'string')
      : []
    const lc = (s: string) => String(s || '').toLowerCase()

    const mapping: Record<string, string> = {
      date: headers.find((h: string) => lc(h).includes('date')) || 'date',
      kWh: headers.find((h: string) => lc(h).includes('kwh') || lc(h).includes('consumption') || lc(h).includes('usage')) || 'kWh',
      site: headers.find((h: string) => lc(h).includes('site') || lc(h).includes('location')) || '',
    }

    return Response.json({
      mapping,
      confidence: 0.5,
      alternatives: {},
      warnings: ['AI service unavailable — using naive header matching'],
      confidence_band: 'low',
      fallback_used: true,
      latency_ms: 0,
    })
  }
}
