'use strict';
const { test, expect } = require('@playwright/test');
const creds = require('../test-credentials.json');

// The Claim page auto-advances to the confirm step when pin.length >= 4
// (handleSetPin fires). So we enter exactly 4 digits for each step to avoid
// extra clicks landing on the navigating/unmounting page.
async function enterExact(page, digits) {
  for (const digit of digits) {
    await page.getByRole('button', { name: digit, exact: true }).first().click();
  }
}

test.describe('Claim — account activation golden path', () => {
  test('new staff can claim account, set PIN, and reach dashboard', async ({ page }) => {
    await page.goto(`/claim?token=${creds.claimToken}`);
    await expect(page.getByRole('heading', { name: /welcome to shiftable/i })).toBeVisible();

    // Step 1: set PIN — 4 digits triggers auto-advance to confirm step
    await enterExact(page, '4444');

    // Wait for the confirm step to appear before entering confirm digits
    await expect(page.getByText(/confirm your pin/i)).toBeVisible();

    // Step 2: confirm PIN — same 4 digits triggers the claim API call
    await enterExact(page, '4444');

    await page.waitForURL('/', { timeout: 15_000 });
    await expect(page.getByRole('link', { name: /view schedule/i }).first()).toBeVisible();
  });

  test('invalid claim token shows error after pin entry', async ({ page }) => {
    await page.goto('/claim?token=not-a-real-token');
    await expect(page.getByRole('heading', { name: /welcome to shiftable/i })).toBeVisible();

    // Step 1: set PIN
    await enterExact(page, '1234');
    await expect(page.getByText(/confirm your pin/i)).toBeVisible();

    // Step 2: confirm PIN — triggers the claim API which rejects the invalid token
    await enterExact(page, '1234');

    await expect(page.getByText(/invalid|expired|failed/i)).toBeVisible({ timeout: 5_000 });
  });
});
