const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'

export async function GET() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const upstream = await fetch(`${AI_URL}/healthz`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)

    if (!upstream.ok) {
      return Response.json({ status: 'degraded', ai: false, message: `AI service returned ${upstream.status}` })
    }

    const data = await upstream.json()
    return Response.json({ status: 'ok', ai: true, ...data })
  } catch {
    return Response.json({ status: 'degraded', ai: false, message: 'AI service unreachable' })
  }
}
