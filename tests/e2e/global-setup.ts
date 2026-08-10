/**
 * tests/e2e/global-setup.ts — Playwright globalSetup.
 *
 * Runs once before the whole test run (before any browser/page is created),
 * but AFTER playwright.config.ts's webServer has already been spawned with
 * whatever process.env held at config-load time. That means this file can't
 * retroactively fix a Next.js build that started with placeholder env vars —
 * `.env.e2e.local` (written by `npm run db:e2e:start`, loaded via dotenv at
 * the top of playwright.config.ts) must already exist before `playwright
 * test` is invoked at all.
 *
 * Given that, this file's job is narrower than full provisioning:
 *  1. Confirm the env vars Playwright/webServer are already using are present.
 *  2. Confirm the local Supabase stack they point at is actually up — and if
 *     Docker was stopped since the last run, bring it back with
 *     `supabase start` (fast: it's already provisioned, no schema/psql work).
 *  3. Wait for GoTrue's health endpoint so the very first test isn't racing
 *     container startup.
 *  4. Re-seed the fixture auth users — defensive against `supabase db reset`
 *     or a fresh container run since fixtures were last written.
 */
import {
  ensureFixtureUsers,
  startSupabase,
  tryGetSupabaseStatus,
  waitForHealth,
} from '../../scripts/e2e-db-lib.mjs'

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

function log(msg: string) {
  console.log(`[global-setup] ${msg}`)
}

export default async function globalSetup() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')} — run \`npm run db:e2e:start\` to provision the local ` +
        'Supabase stack before running Playwright (see E2E-TESTS.md Phase 2).',
    )
  }

  log('Checking local Supabase stack status...')
  let status = tryGetSupabaseStatus()
  if (!status) {
    log('Local stack is not running — starting it (this does not re-apply the schema)...')
    startSupabase()
    status = tryGetSupabaseStatus()
  }
  if (!status) {
    throw new Error(
      '`supabase status` still failed after `supabase start` — check Docker is running and ' +
        '`npm run db:e2e:start` has been run at least once.',
    )
  }

  log('Waiting for the local stack to become healthy...')
  await waitForHealth(status.apiUrl)

  log('Re-seeding fixture auth users (idempotent)...')
  await ensureFixtureUsers(status)

  log('Local Supabase stack is ready.')
}
