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

// Dispatch a synthetic beforeinstallprompt event to trigger the Android install banner.
// We wait for the React tree to be fully mounted (useEffect has run) before firing.
async function fireInstallPrompt(page) {
  // Small wait ensures React useEffect listeners have been registered.
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.preventDefault = () => {};
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
}

test.describe('PWA install banner', () => {
  test('Android install banner appears when beforeinstallprompt fires', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);

    await fireInstallPrompt(page);

    await expect(page.getByRole('button', { name: 'Install' })).toBeVisible({ timeout: 3_000 });
  });

  test('install banner can be dismissed with × button', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);

    await fireInstallPrompt(page);

    await expect(page.getByRole('button', { name: 'Install' })).toBeVisible({ timeout: 3_000 });

    // The dismiss button renders the × character (U+00D7)
    await page.getByRole('button', { name: '×' }).click();

    await expect(page.getByRole('button', { name: 'Install' })).not.toBeVisible();
  });
});
