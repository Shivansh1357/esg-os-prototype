import { expect, test } from '@playwright/test'

test('theme toggle persists across reload and route changes', async ({ page }) => {
  await page.goto('/')
  const root = page.locator('html')

  await page.getByTestId('theme-toggle').click()
  await page
    .getByRole('menuitem', { name: 'Dark' })
    .first()
    .evaluate((el) => (el as HTMLElement).click())
  await expect(root).toHaveClass(/dark/)

  await page.reload()
  await expect(root).toHaveClass(/dark/)

  await page.goto('/reports')
  await expect(root).toHaveClass(/dark/)

  await page.getByTestId('theme-toggle').click()
  await page
    .getByRole('menuitem', { name: 'Light' })
    .first()
    .evaluate((el) => (el as HTMLElement).click())
  await expect(root).not.toHaveClass(/dark/)
})
