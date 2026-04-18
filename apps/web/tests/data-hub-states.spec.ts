import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

type Fact = {
  id: string
  entityId: string
  metricCode: string
  periodStart: string
  periodEnd: string
  value: number
  unit: string
  status: 'DRAFT' | 'APPROVED'
  sourceType?: string
  sourceRef?: string
  outlier?: boolean
}

function makeFacts(count: number): Fact[] {
  const out: Fact[] = []
  for (let i = 0; i < count; i += 1) {
    const idSuffix = String(i + 1).padStart(12, '0')
    out.push({
      id: `00000000-0000-0000-0000-${idSuffix}`,
      entityId: `11111111-1111-1111-1111-${idSuffix}`,
      metricCode: 'ELEC_KWH',
      periodStart: '2025-07-01',
      periodEnd: '2025-09-30',
      value: 100 + i,
      unit: 'kWh',
      status: i % 2 === 0 ? 'DRAFT' : 'APPROVED',
      sourceType: 'CSV',
      sourceRef: `s3://facts/${i + 1}.csv`,
      outlier: i % 10 === 0,
    })
  }
  return out
}

async function mockReportEndpoints(page: Page) {
  await page.route('**/reports/by-period**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  await page.route('**/reports/*', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' })
  })
}

test('data hub shows loading then empty state', async ({ page }) => {
  await mockReportEndpoints(page)

  await page.route('**/graphql', async (route) => {
    const req = route.request().postDataJSON() as { query?: string }
    if (req?.query?.includes('listFacts')) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { listFacts: [] } }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) })
  })

  await page.goto('/data')
  await expect(page.getByTestId('data-hub-loading')).toBeVisible()
  await expect(page.getByTestId('data-hub-empty')).toBeVisible()
})

test('data hub renders error state on listFacts failure', async ({ page }) => {
  await mockReportEndpoints(page)

  await page.route('**/graphql', async (route) => {
    const req = route.request().postDataJSON() as { query?: string }
    if (req?.query?.includes('listFacts')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'synthetic listFacts failure' }] }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) })
  })

  await page.goto('/data')
  await expect(page.getByTestId('data-hub-error')).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('data hub pagination is stable for deterministic rows', async ({ page }) => {
  await mockReportEndpoints(page)
  const facts = makeFacts(30)

  await page.route('**/graphql', async (route) => {
    const req = route.request().postDataJSON() as { query?: string }
    if (req?.query?.includes('listFacts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { listFacts: facts } }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) })
  })

  await page.goto('/data')
  await expect(page.getByTestId('data-hub-page-indicator')).toContainText('Showing 1-25 of 30')

  await page.getByTestId('data-hub-pagination-next').click()
  await expect(page.getByTestId('data-hub-page-indicator')).toContainText('Showing 26-30 of 30')

  await page.getByTestId('data-hub-pagination-prev').click()
  await expect(page.getByTestId('data-hub-page-indicator')).toContainText('Showing 1-25 of 30')
})
