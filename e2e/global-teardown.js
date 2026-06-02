'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const E2E_DB = path.join(os.tmpdir(), 'shiftable-e2e.db');
const CREDS_PATH = path.join(__dirname, 'test-credentials.json');

module.exports = async function globalTeardown() {
  for (const f of [E2E_DB, `${E2E_DB}-wal`, `${E2E_DB}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  if (fs.existsSync(CREDS_PATH)) fs.unlinkSync(CREDS_PATH);
};
