import { expect, test } from './fixtures'

test('exec and emissions chart containers render in baseline states', async ({ page, authedRequest, authHeaders }) => {
  const createReport = await authedRequest.post('/graphql', {
    headers: authHeaders,
    data: {
      query: 'mutation C($name:String!, $template:String!){ createReport(name:$name, template:$template) }',
      variables: { name: `Chart State ${Date.now()}`, template: 'BRSR' }
    }
  })
  expect(createReport.ok()).toBeTruthy()
  const createJson = await createReport.json()
  const reportId = createJson.data?.createReport as string

  await page.goto(`/exec?reportId=${reportId}`)
  await expect(page.getByText('Scope 3 Breakdown')).toBeVisible()
  await expect(page.locator('.recharts-surface').first()).toBeVisible()

  await page.goto('/emissions')
  await expect(page.getByText('Quarter-over-Quarter Comparison')).toBeVisible()
  await expect(page.locator('.recharts-surface').first()).toBeVisible()
})
