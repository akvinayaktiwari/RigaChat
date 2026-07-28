import { defineConfig, devices } from '@playwright/test'

// Local-only smoke suite (not wired into CI yet -- run manually via
// `npm test` from this directory). Chromium only: this is meant to catch
// "is the golden path actually broken," not cross-browser regressions.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Reuses whatever's already running on these ports (e.g. your own `npm run
  // dev` in another terminal) instead of starting a second copy; only spawns
  // fresh servers if nothing's listening yet.
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      port: 3000,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: '../frontend',
      port: 5173,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
