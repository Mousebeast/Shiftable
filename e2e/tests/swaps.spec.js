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

test.describe('Shift swap — view golden path', () => {
  test('staff can view the swaps page', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/swaps');
    await expect(page.getByRole('heading', { name: 'Shift Swaps' })).toBeVisible();
  });

  test('"Offer a shift" button is present on swaps page', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/swaps');
    // The offer button is visible in the sticky header when not in offer mode
    await expect(page.getByRole('button', { name: 'Offer a shift' })).toBeVisible();
  });

  test('clicking "Offer a shift" enters offer mode', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/swaps');
    await page.getByRole('button', { name: 'Offer a shift' }).click();
    // In offer mode the page shows "Which shift do you want to offer?" prompt
    // and a Cancel button to exit offer mode
    await expect(page.getByText(/which shift do you want to offer/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });
});
