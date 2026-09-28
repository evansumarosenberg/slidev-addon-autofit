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
  webServer: [{
    command: 'node node_modules/@slidev/cli/bin/slidev.mjs tests/fixtures/autofit.md --port 4173 --log error',
    url: fixtureUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: 'node node_modules/@slidev/cli/bin/slidev.mjs tests/fixtures/display-math/slides.md --port 4180 --log error',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    timeout: 120_000,
  }],
  projects: [
    {
      name: 'chromium',
      testIgnore: ['autofit-display-math.spec.ts', 'autofit-production.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-math',
      testMatch: 'autofit-display-math.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4180' },
    },
  ],
})
