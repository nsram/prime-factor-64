import { defineConfig } from '@playwright/test';

const port = Number(process.env.PF64_TEST_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}/prime-factor-64/`;
const reportSuffix = port === 4173 ? '' : '-' + port;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 20_000,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  outputDir: 'test-results' + reportSuffix,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' + reportSuffix }]],
  use: {
    baseURL,
    timezoneId: 'America/New_York',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PF64_CHROMIUM_PATH || undefined },
  },
  webServer: { command: 'node tests/helpers/serve.mjs', url: baseURL, reuseExistingServer: false },
});
