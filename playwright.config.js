'use strict';
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
const os = require('os');

const E2E_DB = path.join(os.tmpdir(), 'shiftable-e2e.db');

module.exports = defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: 1,
  // globalSetup is handled by e2e/start-server.js (runs inline before listen).
  // globalTeardown cleans up the DB and credentials after the run.
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: 'http://localhost:3099',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/schedule.spec.js',
    },
  ],
  webServer: {
    command: `DB_PATH=${E2E_DB} JWT_SECRET=e2e-test-secret NODE_ENV=production PORT=3099 node e2e/start-server.js`,
    port: 3099,
    reuseExistingServer: false,
    timeout: 20_000,
    env: {
      DB_PATH: E2E_DB,
      JWT_SECRET: 'e2e-test-secret',
      NODE_ENV: 'production',
      PORT: '3099',
    },
  },
});
