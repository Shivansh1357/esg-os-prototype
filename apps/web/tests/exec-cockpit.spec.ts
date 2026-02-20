import { test, expect } from '@playwright/test'

test('exec cockpit renders KPIs and stays snapshot-consistent after freeze', async ({ page }) => {
  await page.goto('/reports')
  await page.getByTestId('generate-draft').click()
  await expect(page).toHaveURL(/reportId=/)

  const urlAfterDraft = new URL(page.url())
  const reportId = urlAfterDraft.searchParams.get('reportId')
  expect(reportId).toBeTruthy()

  await page.goto(`/exec?reportId=${reportId}`)
  await expect(page.getByTestId('exec-kpi-grid')).toBeVisible()
  const tileCount = await page.getByTestId('exec-kpi-tile').count()
  expect(tileCount).toBeGreaterThanOrEqual(8)
  await expect(page.getByTestId('exec-mode-banner')).toContainText('Mode: Live')

  await page.goto(`/reports?reportId=${reportId}`)
  await page.getByTestId('freeze-report').click()
  await expect(page.getByTestId('report-status')).toContainText('Frozen', { timeout: 15000 })

  await page.goto(`/exec?reportId=${reportId}`)
  await expect(page.getByTestId('exec-mode-banner')).toContainText('Mode: Snapshot')
  await expect(page.getByTestId('exec-calc-version-badge')).toBeVisible()
})
