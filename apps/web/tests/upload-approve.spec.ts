import { test, expect } from '@playwright/test';

test('upload -> mapping -> save drafts -> approve', async ({ page }) => {
  await page.goto('/data');
  await page.getByRole('button', { name: 'Upload' }).click();

  const csv = 'date,kWh,site\n2025-08-01,100,HQ\n2025-08-15,200,HQ\n';
  await page.setInputFiles('input[type="file"]', { name: 'energy.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await page.getByTestId('upload-bill-start-btn').click();
  await expect(page.getByTestId('parse-preview')).toBeVisible({ timeout: 15000 });

  page.once('dialog', async (dialog) => { await dialog.accept('00000000-0000-0000-0000-000000000001'); });
  await page.getByTestId('mapping-accept').click();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('approve-btn').first().click();
  await expect(page.locator('tbody').getByText('APPROVED')).toBeVisible({ timeout: 5000 });
});


