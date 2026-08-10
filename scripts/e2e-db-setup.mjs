#!/usr/bin/env node
/**
 * Provisions the local Supabase stack (Docker, via the Supabase CLI) for
 * Playwright E2E tests, as close to production schema as possible without
 * touching the real project.
 *
 * This repo has no supabase/migrations/ directory by design (see AGENTS.md —
 * the schema SSOT is supabase/reset.sql, applied by hand via the Supabase
 * Dashboard SQL editor in production). Locally we apply the same reset.sql
 * directly over a Postgres connection instead of introducing a migrations
 * folder, so the local stack mirrors production's actual schema without
 * changing how production is deployed.
 *
 * Steps:
 *   1. `supabase start` (idempotent — no-ops if already running)
 *   2. Apply supabase/reset.sql via `psql`, TWICE (see note below)
 *   3. Apply supabase/e2e-grants.sql — re-grants anon/authenticated/
 *      service_role table privileges that a hosted Supabase project sets up
 *      automatically but a plain `psql`-applied schema does not (see that
 *      file's header comment); without this, RLS policies are correctly
 *      defined but Postgres denies with "permission denied for table ..."
 *      before RLS is ever evaluated.
 *   4. Apply supabase/e2e-fixtures.sql (content fixtures — artists/releases/news)
 *      NOTE: deliberately NOT named supabase/seed.sql — the Supabase CLI
 *      auto-runs a file with that exact name during `supabase start`,
 *      *before* reset.sql has been applied, which fails because none of the
 *      app tables exist yet. Keeping our own name means we control order.
 *   5. Bootstrap 3 fixture auth users (admin/artist/journalist) via the
 *      GoTrue admin API and promote their public.users.role
 *   6. Write .env.e2e.local with everything Playwright needs
 *
 * Why apply reset.sql via `psql` and TWICE:
 * reset.sql has a handful of early statements (e.g. the deprecated
 * `press` → `journalist` role migration) that reference tables created
 * later in the same file — harmless on a database that already has some
 * version of the schema (the assumed real-world usage: pasted into the
 * Supabase Dashboard SQL editor, which runs statement-by-statement and
 * continues past individual errors), but fatal on a truly empty database if
 * run as one atomic transaction. `psql` without `ON_ERROR_STOP` reproduces
 * that same "continue past errors, autocommit per statement" behavior, and
 * a second pass is a full no-op/completion run that picks up anything the
 * first pass's early errors skipped. Verified: 0 real errors on pass 2.
 *
 * Safe to re-run: reset.sql and e2e-fixtures.sql are idempotent, and
 * fixture users are looked up before creation.
 *
 * Usage: npm run db:e2e:start
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_USERS, ensureFixtureUsers, readStatus } from './e2e-db-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function log(msg) {
  console.log(`[e2e-db-setup] ${msg}`)
}

function run(cmd, args) {
  log(`$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status}): ${cmd} ${args.join(' ')}\n${result.stderr}`,
    )
  }
  return result.stdout
}

function applySqlFileViaPsql(dbUrl, relativePath) {
  const fullPath = join(root, relativePath)
  log(`Applying ${relativePath} via psql...`)
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=0', '-f', fullPath], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
  // psql's own exit code reflects the LAST statement's status, not the whole
  // script — the reset.sql pass-1/pass-2 convergence relies on tolerating
  // mid-script errors (see file header), so we log stderr and move on rather
  // than throwing on a non-zero exit here.
  if (result.stderr) {
    const realErrors = result.stderr
      .split('\n')
      .filter((line) => /ERROR:/.test(line))
    if (realErrors.length > 0) {
      log(`  (${realErrors.length} statement error(s) in ${relativePath} — expected on pass 1, see header comment)`)
    }
  }
  if (result.error) {
    throw result.error
  }
}

async function main() {
  log('Starting local Supabase stack (first run pulls Docker images — can take several minutes)...')
  run('npx', ['--yes', 'supabase', 'start'])

  const status = readStatus(JSON.parse(runCapture('npx', ['--yes', 'supabase', 'status', '-o', 'json'])))

  // Pass 1 tolerates a few expected early-forward-reference errors; pass 2
  // converges to a clean, fully-applied schema. See file header comment.
  applySqlFileViaPsql(status.dbUrl, 'supabase/reset.sql')
  applySqlFileViaPsql(status.dbUrl, 'supabase/reset.sql')
  // reset.sql creates tables as `postgres` via a plain psql connection, which
  // does not inherit the anon/authenticated/service_role grants a hosted
  // Supabase project sets up automatically — see file header comment.
  applySqlFileViaPsql(status.dbUrl, 'supabase/e2e-grants.sql')
  applySqlFileViaPsql(status.dbUrl, 'supabase/e2e-fixtures.sql')

  const envLines = [
    '# Generated by scripts/e2e-db-setup.mjs — do not edit by hand.',
    `NEXT_PUBLIC_SUPABASE_URL=${status.apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${status.serviceRoleKey}`,
    // Direct Postgres connection — needed by tests that must bypass
    // PostgREST's public-schema-only exposure (e.g. querying pg_catalog for
    // RLS validation; see tests/e2e/rls-validation.spec.ts).
    `SUPABASE_DB_URL=${status.dbUrl}`,
  ]

  log('Bootstrapping fixture auth users...')
  await ensureFixtureUsers(status)
  for (const user of FIXTURE_USERS) {
    envLines.push(`${user.envPrefix}_EMAIL=${user.email}`)
    envLines.push(`${user.envPrefix}_PASSWORD=${user.password}`)
  }

  // Back-compat: tests/e2e/portal.spec.ts reads these var names directly
  // instead of going through tests/helpers/auth.ts. Same artist fixture.
  const artist = FIXTURE_USERS.find((u) => u.role === 'artist')
  envLines.push(`PLAYWRIGHT_PORTAL_EMAIL=${artist.email}`)
  envLines.push(`PLAYWRIGHT_PORTAL_PASSWORD=${artist.password}`)

  writeFileSync(join(root, '.env.e2e.local'), envLines.join('\n') + '\n')
  log('Wrote .env.e2e.local')
  log('Local Supabase stack is ready for E2E tests.')
}

main().catch((err) => {
  console.error('[e2e-db-setup] FAILED:', err)
  process.exit(1)
})
