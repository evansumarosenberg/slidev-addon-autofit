import { defineConfig, devices } from '@playwright/test'

const fixtureUrl = 'http://localhost:4173'

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: 'autofit-production.spec.ts',
  outputDir: './test-results',
  fullyParallel: false,
  reporter: 'line',
  workers: 1,
  use: {
    baseURL: fixtureUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/@slidev/cli/bin/slidev.mjs tests/fixtures/autofit.md --port 4173 --log error',
    url: fixtureUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
