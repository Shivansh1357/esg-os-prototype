import { expect, test } from './fixtures'

test('pilot dashboard renders admin metrics and feedback stream', async ({ page, authedRequest, authHeaders }) => {
  const feedback = await authedRequest.post('/feedback', {
    headers: authHeaders,
    data: { page: '/pilot', message: 'Pilot page is useful', rating: 5 }
  })
  expect(feedback.ok()).toBeTruthy()

  await page.goto('/pilot?mode=admin')
  await expect(page.getByTestId('pilot-summary-ttf')).toBeVisible()
  await expect(page.getByTestId('pilot-summary-freeze')).toBeVisible()
  await expect(page.getByText('Feedback Stream')).toBeVisible()
  await expect(page.getByText('Pilot page is useful')).toBeVisible()
})

test('pilot dashboard blocks non-admin role', async ({ page }) => {
  await page.goto('/pilot?mode=member')
  await expect(page.getByText('Insufficient permissions.')).toBeVisible()
})
