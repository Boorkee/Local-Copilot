const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:4180', viewport: { width: 380, height: 820 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/preview-webview.cjs', url: 'http://127.0.0.1:4180', reuseExistingServer: !process.env.CI },
});
