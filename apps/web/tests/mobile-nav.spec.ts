import { expect, test } from '@playwright/test'

test('mobile navigation opens via sheet and routes correctly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByTestId('mobile-nav-open')).toBeVisible()
  await page.getByTestId('mobile-nav-open').click()
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible()

  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page).toHaveURL(/\/reports/)
})
