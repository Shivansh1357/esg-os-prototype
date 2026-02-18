import { test as base, APIRequestContext, request } from '@playwright/test'
import { makeAuthHeaders } from './jwt'

type Fixtures = {
  authedRequest: APIRequestContext
  authHeaders: Record<string, string>
}

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.E2E_TENANT_ID ?? '00000000-0000-0000-0000-00000000e2e1'
const userId = process.env.NEXT_PUBLIC_USER_ID ?? process.env.E2E_USER_ID ?? '00000000-0000-0000-0000-00000000e2e2'
const apiBaseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const test = base.extend<Fixtures>({
  authHeaders: async ({}, use) => {
    await use({
      ...makeAuthHeaders({ tenantId, userId, role: 'ADMIN' }),
      'content-type': 'application/json'
    })
  },
  authedRequest: async ({ playwright, authHeaders }, use) => {
    const ctx = await request.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: authHeaders
    })
    try {
      await use(ctx)
    } finally {
      await ctx.dispose()
    }
  }
})

export { expect } from '@playwright/test'
