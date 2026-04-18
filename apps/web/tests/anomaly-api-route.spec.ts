import { expect, test } from '@playwright/test'

import { POST } from '../app/api/ai/anomaly/route'

const originalFetch = global.fetch

test.afterEach(() => {
  global.fetch = originalFetch
})

test('anomaly route fallback preserves request payload when AI is unavailable', async () => {
  global.fetch = (async () => {
    throw new Error('AI offline')
  }) as typeof fetch

  const response = await POST(
    new Request('http://localhost:5050/api/ai/anomaly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metricCode: 'ELEC_KWH',
        currentValue: 160,
        historicalValues: [100, 100, 100],
      }),
    })
  )

  expect(response.ok).toBeTruthy()

  const json = await response.json()
  expect(json.fallback_used).toBe(true)
  expect(json.isOutlier).toBe(true)
  expect(json.historicalMean).toBe(100)
  expect(json.explanation).toContain('160')
})
