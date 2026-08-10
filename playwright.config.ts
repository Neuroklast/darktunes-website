/**
 * playwright.config.ts — darkTunes E2E & Visual Regression Test Configuration
 *
 * Runs against a locally built Next.js production server (npm run build &&
 * npm run start) for production-parity results.
 *
 * Projects:
 *  - Desktop Chrome  (1920 × 1080) — PR default in QA workflow
 *  - Mobile Safari   (iPhone 13 — 390 × 844) — main / full matrix
 *  - Mobile Chrome   (Pixel 5   — 393 × 851) — main / full matrix
 *  - Performance Chrome — `npm run perf:test` / performance-tests workflow
 *
 * CI selects projects via `npx playwright test --project=...` (see qa.yml).
 * Workers: CI defaults to 2 (override with PLAYWRIGHT_WORKERS).
 */

import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

/* Local Supabase stack credentials, written by `npm run db:e2e:start`
 * (scripts/e2e-db-setup.mjs). Falls back to placeholders below when absent
 * so `npm run test:e2e` still works for route-level tests that don't need a
 * real backend. Loaded here (not relying on Next's own .env.local handling)
 * so both the webServer's Next process AND the Playwright test runner itself
 * (tests/helpers/*) see the same values. */
loadEnv({ path: '.env.e2e.local', quiet: true })

const ciWorkers = Number(process.env.PLAYWRIGHT_WORKERS || '2')

export default defineConfig({
  testDir: './tests',

  /* Maximum time a single test may run. */
  timeout: 30_000,

  /* Maximum time for the full test suite. With `workers: 1` (see below) the
   * whole matrix — 3 browser projects over every tests/e2e spec — runs
   * serially, so this must accommodate hundreds of sequential tests on CI's
   * slower runners. The previous flat 10 min silently truncated CI runs
   * mid-suite: reporting just stops partway through, which reads like a hang
   * rather than a timeout. */
  globalTimeout: (process.env.CI ? 60 : 30) * 60_000,

  /* Fail the build on CI if a test.only() accidentally gets committed. */
  forbidOnly: !!process.env.CI,

  /* CI runners have no committed snapshot baselines (per AGENTS.md); seed on first run. */
  updateSnapshots: process.env.CI ? 'missing' : 'none',

  /* Retry once on CI to reduce flakiness caused by resource contention. */
  retries: process.env.CI ? 1 : 0,

  /* Parallelism: DB-backed runs share one Supabase stack + fixture users
   * (tests/helpers/README.md), so workers stay serial to avoid races
   * (E2E-TESTS.md "Test isolation"). Override with PLAYWRIGHT_WORKERS only
   * for non-DB smoke runs. */
  workers:
    process.env.PLAYWRIGHT_WORKERS && Number.isFinite(Number(process.env.PLAYWRIGHT_WORKERS))
      ? Number(process.env.PLAYWRIGHT_WORKERS)
      : 1,

  /* Reporter: 'list' for concise terminal output; HTML report always generated. */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Ensures the local Supabase stack (Docker) is up, healthy, and its fixture
   * auth users exist before any test runs; optionally stops it afterward.
   * See tests/e2e/global-setup.ts for why this can't provision from scratch
   * (webServer below already starts before globalSetup runs). */
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  use: {
    /* Base URL used by page.goto('/') etc. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',

    /* Capture traces only on first retry to aid debugging. */
    trace: 'on-first-retry',

    /* Collect screenshots on failure. */
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'Desktop Chrome',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'Mobile Safari',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
      },
    },
    {
      name: 'Mobile Chrome',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'Performance Chrome',
      testMatch: /performance\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  /* Automatically start the Next.js production server before the test run.
   * The server is stopped automatically after all tests complete.
   *
   * CI hint: set SKIP_BUILD=1 if the build artifact already exists (e.g. from
   * a previous job step) to avoid rebuilding on every run. */
  webServer: {
    command:
      process.env.SKIP_BUILD === '1'
        ? 'npm run preview'
        : 'npm run build && npm run preview',
    url: 'http://localhost:3000',
    /* Allow up to 5 minutes for the build + server start. */
    timeout: 5 * 60_000,
    /* Reuse an already-running server in local development. */
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      /* Ensure the server binds to the expected port. */
      PORT: '3000',
      /* Local-stack defaults (Supabase CLI's well-known local dev demo
       * credentials — public, identical for every project using default
       * supabase/config.toml, safe to hardcode). Used only when
       * .env.e2e.local hasn't been loaded above (e.g. before the first
       * `npm run db:e2e:start`) so a plain `next build` still succeeds and,
       * once tests/e2e/global-setup.ts brings the stack up, actually points
       * at a real backend instead of an unreachable fake domain. */
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID || 'placeholder-r2-account',
      CLOUDFLARE_R2_ACCESS_KEY_ID:
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || 'placeholder-r2-access-key',
      CLOUDFLARE_R2_SECRET_ACCESS_KEY:
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || 'placeholder-r2-secret-key',
      CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'placeholder-bucket',
      CLOUDFLARE_R2_PUBLIC_URL:
        process.env.CLOUDFLARE_R2_PUBLIC_URL || 'https://cdn.placeholder.example',
      /* Required by src/lib/env.server.ts's Zod schema (64-char hex) wherever
       * api_credentials encrypt/decrypt code runs — not just at build time,
       * e.g. /portal at runtime. No E2E test exercises real encrypted
       * credentials, so a fixed placeholder is fine. */
      API_CREDENTIALS_ENCRYPTION_KEY:
        process.env.API_CREDENTIALS_ENCRYPTION_KEY ||
        'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8',
    },
  },
})
