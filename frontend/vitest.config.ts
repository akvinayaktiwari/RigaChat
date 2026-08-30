import { defineConfig } from 'vitest/config'

// Mirrors backend/vitest.config.ts so both halves of the repo are run the same
// way. The difference is the environment: these tests touch sessionStorage and
// React state, so they need a DOM rather than bare node.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // Threads, not vitest's default "forks" pool. Under forks on macOS this
    // suite takes ~906s and reports 6 files as failed -- but the failures are
    // "Failed to start forks worker" / "Timeout waiting for worker to respond",
    // never an assertion. Worse, the crashed run silently reports a SMALLER
    // suite (13 files / 169 tests instead of 16 / 306), so ~137 tests never run
    // while the summary still looks plausible, and vitest exits 0 either way.
    // On threads the same suite is 16/16 files and 306/306 tests in ~7s.
    pool: 'threads',
    // Vite resolves import.meta.env at build time; under vitest the modules
    // under test read VITE_API_URL at import, so it needs a value or the
    // service module composes requests against "undefined".
    env: {
      VITE_API_URL: 'http://localhost:3000',
    },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
