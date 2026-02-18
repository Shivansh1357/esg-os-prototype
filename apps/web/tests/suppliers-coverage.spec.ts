import { test, expect } from './fixtures'

test('supplier coverage shows 66.67% after 2 of 3 responses approved', async ({ page, authedRequest }) => {
  const periodStart = '2099-07-01'
  const periodEnd = '2099-09-30'

  const invite = await authedRequest.post(`/suppliers/invite`, {
    data: {
      periodStart,
      periodEnd,
      suppliers: [
        { name: 'PW-S1', email: 'pw-s1@local.test', category: 'Purchased goods', spend: 100 },
        { name: 'PW-S2', email: 'pw-s2@local.test', category: 'Purchased goods', spend: 100 },
        { name: 'PW-S3', email: 'pw-s3@local.test', category: 'Purchased goods', spend: 100 }
      ]
    }
  })
  expect(invite.ok()).toBeTruthy()
  const inviteJson = await invite.json()
  const urls = inviteJson.invites.map((x: any) => String(x.url))

  const t1 = urls[0].split('/').pop()
  const t2 = urls[1].split('/').pop()

  const submit1 = await authedRequest.post(`/s/${t1}`, { data: { emissionsKgCO2e: 11, dataQualityTier: 'PRIMARY' } })
  const submit2 = await authedRequest.post(`/s/${t2}`, { data: { emissionsKgCO2e: 22, dataQualityTier: 'PRIMARY' } })
  expect(submit1.ok()).toBeTruthy()
  expect(submit2.ok()).toBeTruthy()

  const responses = await authedRequest.get(`/suppliers/responses?periodStart=${periodStart}&periodEnd=${periodEnd}`)
  const responseJson = await responses.json()
  const submittedRows = responseJson.filter((row: any) => row.emissionsKgCO2e != null).slice(0, 2)
  for (const row of submittedRows) {
    const approve = await authedRequest.post(`/suppliers/responses/approve`, {
      data: { responseId: row.id }
    })
    expect(approve.ok()).toBeTruthy()
  }
  const apiCoverage = await authedRequest.get(`/suppliers/coverage?periodStart=${periodStart}&periodEnd=${periodEnd}`)
  expect(apiCoverage.ok()).toBeTruthy()
  const apiCoverageJson = await apiCoverage.json()
  expect(Number(apiCoverageJson.coverageByCountPercent)).toBeCloseTo(66.67, 2)

  await page.addInitScript(() => {
    window.localStorage.removeItem('reportId')
  })
  await page.goto(`/suppliers?periodStart=${periodStart}&periodEnd=${periodEnd}`)
  await expect(page.getByTestId('supplier-coverage-count')).toContainText('66.67%')
})
