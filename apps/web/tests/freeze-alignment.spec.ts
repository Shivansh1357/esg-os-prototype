import { test, expect } from '@playwright/test'

test('freeze alignment disables mutable actions and shows snapshot state', async ({ page }) => {
  await page.goto('/reports')
  await page.getByTestId('generate-draft').click()
  await expect(page).toHaveURL(/reportId=/)
  await expect(page.getByTestId('report-status')).toContainText('Draft')
  await page.getByTestId('freeze-report').click()

  await expect(page.getByTestId('report-status')).toContainText('Frozen')
  await expect(page.getByTestId('export-mode-banner')).toContainText('Snapshot Mode')
  await expect(page.getByTestId('calc-version')).toBeVisible()

  await page.goto('/emissions')
  await expect(page.getByTestId('frozen-period-banner')).toBeVisible()
  await expect(page.getByTestId('recalc-button')).toBeDisabled()
  await expect(page.getByTestId('calc-version-badge')).toBeVisible()

  await page.goto('/compliance')
  await expect(page.getByTestId('frozen-snapshot-label')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled()
})
