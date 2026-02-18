import { test, expect } from '@playwright/test'

test('report context persists in URL across navigation', async ({ page }) => {
  await page.goto('/reports')

  await page.getByTestId('generate-draft').click()
  await expect(page).toHaveURL(/reportId=/)
  await expect(page.getByTestId('report-status')).toContainText('Draft')
  await page.getByTestId('freeze-report').click()
  await expect(page.getByTestId('report-status')).toContainText('Frozen')
  await expect(page.getByTestId('report-context-banner')).toBeVisible()

  const selector = page.getByTestId('report-selector')
  const frozenValue = await selector.evaluate((el: HTMLSelectElement) => {
    const option = Array.from(el.options).find((o) => o.textContent?.includes('Frozen'))
    return option?.value || ''
  })

  await page.getByTestId('generate-draft').click()
  await expect(page.getByTestId('report-status')).toContainText('Draft')
  await expect(page.getByTestId('report-context-banner')).toBeVisible()

  const draftValue = await selector.evaluate((el: HTMLSelectElement) => {
    const option = Array.from(el.options).find((o) => o.textContent?.includes('Draft') && o.value !== '')
    return option?.value || ''
  })
  expect(frozenValue).not.toBe('')
  expect(draftValue).not.toBe('')

  await selector.selectOption(frozenValue)
  await expect(page.getByTestId('report-status')).toContainText('Frozen')
  await expect(page).toHaveURL(new RegExp(`reportId=${frozenValue}`))

  await page.getByRole('link', { name: 'Emissions' }).click()
  await expect(page).toHaveURL(new RegExp(`\\/emissions\\?reportId=${frozenValue}`))
  await expect(page.getByTestId('report-context-banner')).toBeVisible()
  await page.locator('input[placeholder="paste entity UUID"]').fill('00000000-0000-0000-0000-000000000001')
  await expect(page.getByTestId('recalc-button')).toBeDisabled()

  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page).toHaveURL(new RegExp(`\\/reports\\?reportId=${frozenValue}`))
  await expect(page.getByTestId('report-context-banner')).toBeVisible()
  await selector.selectOption(draftValue)
  await expect(page.getByTestId('report-status')).toContainText('Draft')
  await expect(page).toHaveURL(new RegExp(`reportId=${draftValue}`))

  await page.getByRole('link', { name: 'Emissions' }).click()
  await expect(page).toHaveURL(new RegExp(`\\/emissions\\?reportId=${draftValue}`))
  await expect(page.getByTestId('report-context-banner')).toBeVisible()
  await page.locator('input[placeholder="paste entity UUID"]').fill('00000000-0000-0000-0000-000000000001')
  await expect(page.getByTestId('recalc-button')).toBeEnabled()
})
