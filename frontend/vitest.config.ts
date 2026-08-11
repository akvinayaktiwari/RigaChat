import { defineConfig } from 'vitest/config'

// Mirrors backend/vitest.config.ts so both halves of the repo are run the same
// way. The difference is the environment: these tests touch sessionStorage and
// React state, so they need a DOM rather than bare node.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // Vite resolves import.meta.env at build time; under vitest the modules
    // under test read VITE_API_URL at import, so it needs a value or the
    // service module composes requests against "undefined".
    env: {
      VITE_API_URL: 'http://localhost:3000',
    },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
