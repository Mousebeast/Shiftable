'use strict';
const { test, expect } = require('@playwright/test');
const creds = require('../test-credentials.json');

// Use the API to log in and get the session cookie, then navigate to the page.
// The PIN keypad auto-submits at 4 digits; 6-digit PINs cause a failed partial
// submit at 4 digits which resets the keypad — so we log in via API for
// navigation tests and only use the keypad UI for tests that specifically test
// the keypad behavior itself.
async function loginViaAPI(page, pin) {
  await page.request.post('/api/auth/login', {
    data: { pin },
    headers: { 'Content-Type': 'application/json' },
  });
  await page.goto('/');
  await page.waitForURL('/');
}

// Click each digit button on the keypad (fires auto-submit at 4 digits).
async function enterPinDigits(page, pin) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).first().click();
  }
}

test.describe('Login — PIN golden path', () => {
  test('staff can log in via API and reach dashboard', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await expect(page.getByRole('link', { name: /view schedule/i }).first()).toBeVisible();
  });

  test('manager can log in via API and sees manager tiles', async ({ page }) => {
    await loginViaAPI(page, creds.manager.pin);
    await expect(page.getByRole('link', { name: /approvals/i }).first()).toBeVisible();
  });

  test('login page shows Shiftable heading', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Shiftable' })).toBeVisible();
  });

  test('wrong PIN (4 digits) shows error and stays on login', async ({ page }) => {
    await page.goto('/login');
    // Enter 4 wrong digits — auto-submit fires with "0000", server returns 401
    await enterPinDigits(page, '0000');
    // After failed submit, error text appears and URL stays on /login
    await expect(page.getByText(/invalid pin/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL('/login');
  });
});
