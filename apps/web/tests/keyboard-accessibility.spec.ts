import { expect, test } from '@playwright/test'

test('feedback popover supports keyboard open and escape close', async ({ page }) => {
  await page.goto('/')

  const feedbackBtn = page.getByTestId('feedback-open')
  await feedbackBtn.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByText('How is your experience so far?')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('How is your experience so far?')).toHaveCount(0)
})
