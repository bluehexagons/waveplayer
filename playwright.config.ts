import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/waveplayer/',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --base /waveplayer/',
    url: 'http://127.0.0.1:4173/waveplayer/',
  },
});
