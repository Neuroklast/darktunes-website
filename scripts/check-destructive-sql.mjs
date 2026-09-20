/**
 * scripts/check-destructive-sql.mjs
 *
 * Guard for auto-applying supabase/reset.sql on deploy.
 *
 * reset.sql is idempotent but historically contains some destructive cleanups
 * (e.g. `DROP COLUMN IF EXISTS` for 3NF migrations). Because the deploy pipeline
 * applies it to production automatically, new destructive statements must be
 * reviewed explicitly.
 *
 * Fails on:
 *   - DROP TABLE / DROP SCHEMA / DROP DATABASE / TRUNCATE
 *   - DROP COLUMN without `IF EXISTS`
 *   - DELETE FROM on any table other than the telemetry allowlist
 *
 * Usage: node scripts/check-destructive-sql.mjs
 * Exit 0 = ok; 1 = destructive statement needs review.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resetPath = join(root, 'supabase', 'reset.sql')

/** Tables that the retention cron job may prune (telemetry + aggregated error logs). */
const DELETE_ALLOWLIST = new Set(['cron_ticks', 'sync_runs', 'app_logs'])

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '')
}

function normalizeTable(raw) {
  return raw.replace(/["'`]/g, '').replace(/^public\./i, '').toLowerCase()
}

function main() {
  const sql = stripComments(readFileSync(resetPath, 'utf8'))
  const violations = []

  for (const match of sql.matchAll(/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b[^;]*/gi)) {
    violations.push(match[0].trim().split('\n')[0])
  }

  for (const match of sql.matchAll(/\bTRUNCATE\b[^;]*/gi)) {
    violations.push(match[0].trim().split('\n')[0])
  }

  for (const match of sql.matchAll(/\bDROP\s+COLUMN\b(?!\s+IF\s+EXISTS)[^;,]*/gi)) {
    violations.push(match[0].trim().split('\n')[0])
  }

  for (const match of sql.matchAll(/\bDELETE\s+FROM\s+([a-zA-Z0-9_."]+)/gi)) {
    const table = normalizeTable(match[1])
    if (!DELETE_ALLOWLIST.has(table)) {
      violations.push(`DELETE FROM ${match[1]}`)
    }
  }

  if (violations.length === 0) {
    console.log('[check-destructive-sql] OK — no unreviewed destructive statements')
    process.exit(0)
  }

  console.error('[check-destructive-sql] FAIL — destructive SQL requires review:')
  for (const v of violations) console.error(`  • ${v}`)
  console.error(
    '\nreset.sql is auto-applied on deploy. Keep schema changes additive; if a\n' +
      'destructive statement is intentional, add it to DELETE_ALLOWLIST (DELETE)\n' +
      'or use the guarded `DROP … IF EXISTS` form.',
  )
  process.exit(1)
}

main()
