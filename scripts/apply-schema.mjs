/**
 * scripts/apply-schema.mjs
 *
 * Applies supabase/reset.sql to the target database.
 *
 * The schema is applied with `psql` (statement-by-statement, matching the
 * Supabase SQL editor semantics — avoids the single-implicit-transaction
 * problem with `ALTER TYPE … ADD VALUE`).
 *
 * Scheduled jobs (sync worker tick, daily enqueue, daily YouTube sync, etc.)
 * are NOT managed here — they are plain HTTPS jobs configured directly in the
 * Supabase dashboard (Integrations → Cron). This script never touches Vault
 * or cron.
 *
 * Required env:
 *   SUPABASE_DB_URL (or DATABASE_URL) — Postgres connection string
 *
 * Usage: npm run db:apply
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resetPath = join(root, 'supabase', 'reset.sql')
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

function applySchema() {
  if (!existsSync(resetPath)) {
    throw new Error(`reset.sql not found at ${resetPath}`)
  }

  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', resetPath], {
    stdio: 'inherit',
  })

  if (result.error) {
    throw new Error(
      `psql could not be started (${result.error.message}). Install the PostgreSQL client tools.`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`psql exited with status ${result.status}`)
  }
}

function main() {
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL (or DATABASE_URL) is required')
  }

  applySchema()

  console.log('[apply-schema] done')
}

try {
  main()
} catch (err) {
  console.error('[apply-schema] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
}
