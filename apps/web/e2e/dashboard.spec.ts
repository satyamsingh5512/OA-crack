import { test, expect } from '@playwright/test';
test('dashboard loads with empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /AI Interview Assistant/i })).toBeVisible();
});
