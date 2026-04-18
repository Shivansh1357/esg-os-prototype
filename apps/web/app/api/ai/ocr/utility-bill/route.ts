const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'

export async function POST(request: Request) {
  try {
    const body = await request.clone().arrayBuffer()
    const contentType = request.headers.get('content-type') || 'application/json'

    const upstream = await fetch(`${AI_URL}/ocr/utility-bill`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    })

    if (!upstream.ok) {
      throw new Error(`AI service returned ${upstream.status}`)
    }

    const data = await upstream.json()
    return Response.json(data)
  } catch {
    // Fallback: return mock data when AI service is unavailable
    return Response.json({
      tables: [],
      fields: [
        { name: 'kWh', candidates: [{ value: '1234', conf: 0.9 }] },
        { name: 'date', candidates: [{ value: new Date().toISOString().slice(0, 10), conf: 0.85 }] },
        { name: 'site', candidates: [{ value: 'HQ', conf: 0.6 }] },
      ],
      confidence: 0.78,
      confidence_band: 'medium',
      fallback_used: true,
      latency_ms: 0,
    })
  }
}
