import { expect, test } from '@playwright/test'

import { POST as postBrief } from '../app/api/ai/brief/monthly/route'
import { POST as postMapColumns } from '../app/api/ai/map/columns/route'

const originalFetch = global.fetch

test.afterEach(() => {
  global.fetch = originalFetch
})

test('brief route fallback preserves posted period values when AI is unavailable', async () => {
  global.fetch = (async () => {
    throw new Error('AI offline')
  }) as typeof fetch

  const response = await postBrief(
    new Request('http://localhost:5050/api/ai/brief/monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodStart: '2025-07-01',
        periodEnd: '2025-09-30',
      }),
    })
  )

  expect(response.ok).toBeTruthy()
  const json = await response.json()
  expect(json.fallback_used).toBe(true)
  expect(json.bullets[0]).toContain('2025-07-01')
  expect(json.bullets[0]).toContain('2025-09-30')
})

test('map columns fallback preserves posted headers when AI is unavailable', async () => {
  global.fetch = (async () => {
    throw new Error('AI offline')
  }) as typeof fetch

  const response = await postMapColumns(
    new Request('http://localhost:5050/api/ai/map/columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headers: ['bill_date', 'power_usage_kwh', 'site_name'],
      }),
    })
  )

  expect(response.ok).toBeTruthy()
  const json = await response.json()
  expect(json.fallback_used).toBe(true)
  expect(json.mapping.date).toBe('bill_date')
  expect(json.mapping.kWh).toBe('power_usage_kwh')
  expect(json.mapping.site).toBe('site_name')
})
