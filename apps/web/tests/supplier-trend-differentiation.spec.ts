import { test, expect } from './fixtures'

test('exec shows supplier trend differentiation and coverage expansion attribution', async ({ page, authedRequest, authHeaders }) => {
  const p1Start = '2099-01-01'
  const p1End = '2099-03-31'
  const p2Start = '2099-04-01'
  const p2End = '2099-06-30'

  const createReport = async (name: string) => {
    const res = await authedRequest.post(`/graphql`, {
      headers: authHeaders,
      data: {
        query: 'mutation C($name:String!,$template:String!){ createReport(name:$name, template:$template) }',
        variables: { name, template: 'BRSR' }
      }
    })
    const json = await res.json()
    return json.data.createReport as string
  }

  const inviteAndApprove = async (periodStart: string, periodEnd: string, approveCount: number, prefix: string) => {
    const invite = await authedRequest.post(`/suppliers/invite`, {
      data: {
        periodStart,
        periodEnd,
        suppliers: [
          { name: `${prefix}-S1`, email: `${prefix}-s1@trend.test`, category: 'Purchased goods', spend: 100 },
          { name: `${prefix}-S2`, email: `${prefix}-s2@trend.test`, category: 'Purchased goods', spend: 100 },
          { name: `${prefix}-S3`, email: `${prefix}-s3@trend.test`, category: 'Purchased goods', spend: 100 }
        ]
      }
    })
    expect(invite.ok()).toBeTruthy()
    const inviteJson = await invite.json()
    const urls = inviteJson.invites.map((x: any) => String(x.url))

    for (let i = 0; i < approveCount; i++) {
      const token = urls[i].split('/').pop()
      const submit = await authedRequest.post(`/s/${token}`, {
        data: { emissionsKgCO2e: 10 + i, dataQualityTier: 'PRIMARY' }
      })
      expect(submit.ok()).toBeTruthy()
    }

    const responses = await authedRequest.get(`/suppliers/responses?periodStart=${periodStart}&periodEnd=${periodEnd}`)
    const rows = await responses.json()
    for (const row of rows) {
      const approve = await authedRequest.post(`/suppliers/responses/approve`, {
        data: { responseId: row.id }
      })
      expect(approve.ok()).toBeTruthy()
    }
  }

  await inviteAndApprove(p1Start, p1End, 2, `t1-${Date.now()}`)
  await createReport(`Trend P1 ${Date.now()}`)

  await inviteAndApprove(p2Start, p2End, 3, `t2-${Date.now()}`)
  const report2 = await createReport(`Trend P2 ${Date.now()}`)

  await page.goto(`/exec?reportId=${report2}`)
  await expect(page.getByTestId('exec-kpi-grid')).toBeVisible()
  await expect(page.getByTestId('supplier-coverage-delta')).not.toContainText('N/A')
  await expect(page.getByTestId('scope3-supplier-breakdown')).toBeVisible()
  await expect(page.getByTestId('scope3-attribution-note')).toContainText('Increase driven by coverage expansion')
})
