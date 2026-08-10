/**
 * tests/e2e/global-teardown.ts — Playwright globalTeardown.
 *
 * Stopping the local Supabase Docker stack after every run would slow down
 * iterative local development (each `npm run test:e2e` would pay full
 * container startup cost again next time). So this is opt-in: set
 * E2E_STOP_DB_AFTER_TESTS=1 (intended for CI, where the runner is torn down
 * anyway) to have Playwright stop the stack when the run finishes.
 */
import { spawnSync } from 'node:child_process'

export default async function globalTeardown() {
  if (process.env.E2E_STOP_DB_AFTER_TESTS !== '1') {
    console.log(
      '[global-teardown] Leaving the local Supabase stack running (set E2E_STOP_DB_AFTER_TESTS=1 to stop it here).',
    )
    return
  }

  console.log('[global-teardown] Stopping the local Supabase stack...')
  spawnSync('npx', ['--yes', 'supabase', 'stop'], { stdio: 'inherit', encoding: 'utf8' })
}
