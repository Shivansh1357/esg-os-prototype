import { Buffer } from 'buffer';
import type { APIRequestContext, Dialog, Page } from '@playwright/test';
import { test, expect } from './fixtures';

type UploadApproveFixtures = {
  page: Page;
  authedRequest: APIRequestContext;
  authHeaders: Record<string, string>;
};

test('upload -> mapping -> save drafts -> approve', async ({ page, authedRequest, authHeaders }: UploadApproveFixtures) => {
  const createReport = await authedRequest.post('/graphql', {
    headers: authHeaders,
    data: {
      query: 'mutation C($name:String!, $template:String!){ createReport(name:$name, template:$template) }',
      variables: { name: `Upload E2E ${Date.now()}`, template: 'BRSR' }
    }
  });
  expect(createReport.ok()).toBeTruthy();
  const createJson = await createReport.json();
  const reportId = createJson.data?.createReport as string;
  expect(reportId).toBeTruthy();

  await page.goto(`/data?reportId=${reportId}`);
  await expect(page.getByTestId('report-context-banner')).toContainText('Viewing Draft Report', { timeout: 15000 });
  await expect(page.getByTestId('data-upload-btn')).toBeEnabled();
  await page.getByTestId('data-upload-btn').click();

  const csv = 'date,kWh,site\n2025-08-01,100,HQ\n2025-08-15,200,HQ\n';
  await page.setInputFiles('input[type="file"]', { name: 'energy.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await page.getByTestId('upload-bill-start-btn').click();
  await expect(page.getByTestId('parse-preview')).toBeVisible({ timeout: 15000 });

  page.once('dialog', async (dialog: Dialog) => { await dialog.accept('00000000-0000-0000-0000-000000000001'); });
  await page.getByTestId('mapping-accept').click();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('approve-btn').first().click();
  await expect(page.locator('tbody').getByText('APPROVED')).toBeVisible({ timeout: 5000 });
});
