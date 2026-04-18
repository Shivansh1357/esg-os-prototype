const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001'
type AnomalyRequestBody = {
  historicalValues?: unknown
  currentValue?: unknown
}

export async function POST(request: Request) {
  let body: AnomalyRequestBody = {}
  try {
    body = (await request.json()) as AnomalyRequestBody
  } catch {
    body = {}
  }

  try {
    const upstream = await fetch(`${AI_URL}/anomaly/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!upstream.ok) {
      throw new Error(`AI service returned ${upstream.status}`)
    }

    return Response.json(await upstream.json())
  } catch {
    // Fallback: basic statistical check when AI service is unavailable
    const values = Array.isArray(body.historicalValues)
      ? body.historicalValues.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : []
    const current = typeof body.currentValue === 'number' && Number.isFinite(body.currentValue) ? body.currentValue : 0
    const mean = values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0
    const isOutlier = mean > 0 && Math.abs(current - mean) / mean > 0.5

    return Response.json({
      isOutlier,
      severity: isOutlier ? 'mild' : 'none',
      zScore: 0,
      explanation: isOutlier
        ? `Value of ${current} differs significantly from historical average of ${mean.toFixed(1)}.`
        : 'Value is within expected range.',
      suggestions: isOutlier ? ['Review source document for accuracy.'] : [],
      historicalMean: mean || null,
      historicalStd: null,
      fallback_used: true,
    })
  }
}
