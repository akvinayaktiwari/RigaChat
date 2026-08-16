import { defineConfig, devices } from '@playwright/test'

// Local-only smoke suite by default (not wired into CI yet -- run manually via
// `npm test` from this directory). Chromium only: this is meant to catch
// "is the golden path actually broken," not cross-browser regressions.
//
// E2E_BASE_URL points the suite at an already-running deployment instead
// (`npm run test:prod`). When it is set the local dev servers are NOT spawned
// -- starting a localhost backend while driving vyostra.com would be worse than
// useless, because a passing run would say nothing about the deployment.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const usingRemote = process.env.E2E_BASE_URL !== undefined

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Reuses whatever's already running on these ports (e.g. your own `npm run
  // dev` in another terminal) instead of starting a second copy; only spawns
  // fresh servers if nothing's listening yet.
  ...(usingRemote
    ? {}
    : {
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
      }),
})
