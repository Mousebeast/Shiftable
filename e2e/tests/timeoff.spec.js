'use strict';
const { test, expect } = require('@playwright/test');
const creds = require('../test-credentials.json');

async function loginViaAPI(page, pin) {
  await page.request.post('/api/auth/login', {
    data: { pin },
    headers: { 'Content-Type': 'application/json' },
  });
  await page.goto('/');
  await page.waitForURL('/');
}

test.describe('Time off — request golden path', () => {
  test('staff can navigate to time-off page', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/timeoff');
    await expect(page.getByRole('button', { name: /submit request/i })).toBeVisible();
  });

  test('staff can submit a time-off request', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/timeoff');

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const startStr = start.toISOString().slice(0, 10);

    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const endStr = end.toISOString().slice(0, 10);

    await page.locator('input[type="date"]').first().fill(startStr);
    await page.locator('input[type="date"]').last().fill(endStr);

    await page.getByRole('button', { name: /submit request/i }).click();

    // After successful submit, "pending" status badge appears in the history
    await expect(page.getByText(/pending/i)).toBeVisible({ timeout: 5_000 });
  });
});
