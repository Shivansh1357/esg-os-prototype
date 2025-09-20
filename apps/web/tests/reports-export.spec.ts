import { test, expect } from '@playwright/test';

test('generate report and export to PDF/XLSX', async ({ page }) => {
  await page.goto('/reports');
  await page.getByTestId('generate-draft').click();

  await expect(page.getByTestId('export-pdf')).toBeVisible();
  await expect(page.getByTestId('export-xlsx')).toBeVisible();

  await page.getByTestId('export-pdf').click();
  await expect(page.getByText(/Exported PDF/i)).toBeVisible({ timeout: 15000 });

  await page.getByTestId('export-xlsx').click();
  await expect(page.getByText(/Exported XLSX/i)).toBeVisible({ timeout: 15000 });

  await expect(page.getByRole('link', { name: 'Download' }).first()).toBeVisible();
});


