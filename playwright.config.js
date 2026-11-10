import { defineConfig, devices } from '@playwright/test'

/** End-to-end checks of the dev playground: the admin and the public site. */
export default defineConfig({
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
      },
    },
  ],
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 2 : 0,
  testDir: './dev',
  testMatch: '**/e2e.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:3000', trace: 'off' },
  webServer: {
    command: 'pnpm dev',
    env: { DEV_FAKE_AI: 'true' },
    reuseExistingServer: true,
    timeout: 180_000,
    url: 'http://localhost:3000/admin',
  },
  workers: 1,
})
