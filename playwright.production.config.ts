import { defineConfig, devices } from '@playwright/test'

const fixtureUrl = 'http://127.0.0.1:4174'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'autofit-production.spec.ts',
  outputDir: './test-results/production-playwright',
  fullyParallel: false,
  reporter: 'line',
  workers: 1,
  use: {
    baseURL: fixtureUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/helpers/serve-autofit-production.mjs',
    url: fixtureUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-production',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
