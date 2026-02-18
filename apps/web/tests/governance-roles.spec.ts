import { expect, test } from './fixtures'
import { request } from '@playwright/test'
import { makeAuthHeaders } from './jwt'

test('governance roles enforce route permissions and read-only UI', async ({ page, authedRequest, authHeaders }) => {
  const createReport = async (name: string) => {
    const res = await authedRequest.post('/graphql', {
      headers: authHeaders,
      data: {
        query: 'mutation C($name:String!, $template:String!){ createReport(name:$name, template:$template) }',
        variables: { name, template: 'BRSR' }
      }
    })
    expect(res.ok()).toBeTruthy()
    const json = await res.json()
    return json.data.createReport as string
  }

  const reportId = await createReport(`Gov Frozen ${Date.now()}`)
  const draftReportId = await createReport(`Gov Draft ${Date.now()}`)

  const memberReq = await request.newContext({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    extraHTTPHeaders: { ...makeAuthHeaders({ tenantId: process.env.NEXT_PUBLIC_TENANT_ID!, userId: process.env.NEXT_PUBLIC_USER_ID!, role: 'MEMBER' }), 'content-type': 'application/json' }
  })

  const memberFreeze = await memberReq.post('/graphql', {
    data: {
      query: 'mutation F($reportId:String!){ freezeReport(reportId:$reportId) }',
      variables: { reportId }
    }
  })
  const memberFreezeJson = await memberFreeze.json()
  expect(memberFreezeJson.errors?.[0]?.message).toContain('Insufficient permissions')
  await memberReq.dispose()

  const adminFreeze = await authedRequest.post('/graphql', {
    headers: authHeaders,
    data: {
      query: 'mutation F($reportId:String!){ freezeReport(reportId:$reportId) }',
      variables: { reportId }
    }
  })
  const adminFreezeJson = await adminFreeze.json()
  expect(adminFreezeJson.data.freezeReport).toBeTruthy()

  await page.goto(`/reports?mode=member&reportId=${reportId}`)
  await expect(page.getByTestId('freeze-report')).toHaveCount(0)
  await page.goto(`/emissions?mode=member&reportId=${reportId}`)
  await page.locator('input[placeholder="paste entity UUID"]').fill('00000000-0000-0000-0000-000000000001')
  await expect(page.getByTestId('recalc-button')).toBeDisabled()

  const auditorReq = await request.newContext({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    extraHTTPHeaders: { ...makeAuthHeaders({ tenantId: process.env.NEXT_PUBLIC_TENANT_ID!, userId: process.env.NEXT_PUBLIC_USER_ID!, role: 'AUDITOR' }), 'content-type': 'application/json' }
  })
  const auditorDraftExport = await auditorReq.post(`/reports/${draftReportId}/export?format=pdf`, { data: {} })
  expect(auditorDraftExport.status()).toBe(403)
  await auditorReq.dispose()

  await page.goto(`/reports?mode=auditor&reportId=${reportId}`)
  await expect(page.getByTestId('auditor-readonly-banner')).toBeVisible()
  await expect(page.getByTestId('generate-draft')).toHaveCount(0)
  await expect(page.getByTestId('freeze-report')).toHaveCount(0)
  await expect(page.getByTestId('export-pdf')).toBeEnabled()

  await page.goto(`/reports?mode=admin&reportId=${reportId}`)
  await expect(page.getByTestId('freeze-report')).toHaveCount(1)
})
