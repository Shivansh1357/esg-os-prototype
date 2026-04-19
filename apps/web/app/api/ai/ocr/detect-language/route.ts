const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'

export async function POST(request: Request) {
  try {
    const body = await request.clone().arrayBuffer()
    const contentType = request.headers.get('content-type') || 'application/json'

    const upstream = await fetch(`${AI_URL}/ocr/detect-language`, {
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
    // Fallback: default to English when AI service is unavailable
    return Response.json({
      language: 'eng',
      latency_ms: 0,
    })
  }
}
