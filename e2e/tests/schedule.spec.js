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

test.describe('Schedule — view golden path', () => {
  test('staff can view their week schedule', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/schedule');
    await expect(page.getByRole('button', { name: 'My Week', exact: true })).toBeVisible();
  });

  test('staff can switch to Full Grid tab', async ({ page }) => {
    await loginViaAPI(page, creds.staff.pin);
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'Full Grid', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Full Grid', exact: true })).toBeVisible();
  });
});

test.describe('Schedule builder — publish golden path @desktop', () => {
  test('manager can view draft and publish it', async ({ page }) => {
    await loginViaAPI(page, creds.manager.pin);
    await page.goto('/builder');

    // The builder opens on the current week (already published).
    // Advance one week to reach the draft schedule seeded in global-setup.
    await page.getByRole('button', { name: '›' }).click();

    // Draft week: Publish button should be visible
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 5_000 });

    // Accept the window.confirm dialog that fires before the publish API call
    page.once('dialog', (dialog) => dialog.accept());

    await page.getByRole('button', { name: 'Publish' }).click();

    // After publish: the "Published" text indicator replaces the Publish button
    await expect(page.getByText('Published')).toBeVisible({ timeout: 10_000 });
  });
});
