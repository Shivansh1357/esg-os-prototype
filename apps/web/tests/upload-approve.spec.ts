import { test, expect } from '@playwright/test';

test('upload -> mapping -> save drafts -> approve', async ({ page }) => {
  await page.goto('/data');
  await page.getByRole('button', { name: 'Upload' }).click();

  const csv = 'date,kWh,site\n2025-08-01,100,HQ\n2025-08-15,200,HQ\n';
  await page.setInputFiles('input[type="file"]', { name: 'energy.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await page.getByTestId('data-upload-btn').click();
  await page.getByTestId('parse-preview');

  await page.getByTestId('mapping-accept').click();
  await page.once('dialog', async (dialog) => { await dialog.accept('seed-1-entity-id'); });

  await page.getByTestId('approve-btn').first().click();
  await expect(page.getByText('APPROVED')).toBeVisible({ timeout: 5000 });
});


