#!/usr/bin/env node
/**
 * Shared helpers for provisioning/checking the local Supabase stack used by
 * E2E tests. Used by both scripts/e2e-db-setup.mjs (full first-time/CI
 * provisioning: schema + fixtures + users) and tests/e2e/global-setup.ts
 * (per-run readiness check: is the stack up, do the fixture users still
 * exist).
 *
 * Kept as a single source of truth for the fixture user list and the
 * `supabase status -o json` parsing so the two entry points can't drift.
 */

import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

export const ARTIST_FIXTURE_ID = 'e2e00000-0000-0000-0000-000000000001'

export const FIXTURE_USERS = [
  {
    role: 'admin',
    email: 'e2e-admin@darktunes.test',
    password: 'E2E-fixture-admin-pw-1!',
    envPrefix: 'E2E_ADMIN',
  },
  {
    role: 'artist',
    email: 'e2e-artist@darktunes.test',
    password: 'E2E-fixture-artist-pw-1!',
    envPrefix: 'E2E_ARTIST',
  },
  {
    role: 'journalist',
    email: 'e2e-journalist@darktunes.test',
    password: 'E2E-fixture-journalist-pw-1!',
    envPrefix: 'E2E_JOURNALIST',
  },
]

/** Normalizes Supabase CLI's `status -o json` output across CLI versions (key casing varies). */
export function readStatus(json) {
  const get = (...keys) => {
    for (const k of keys) {
      if (json[k] !== undefined) return json[k]
    }
    throw new Error(`\`supabase status -o json\` is missing expected key(s): ${keys.join(', ')}`)
  }
  return {
    apiUrl: get('API_URL', 'api_url'),
    dbUrl: get('DB_URL', 'db_url'),
    anonKey: get('ANON_KEY', 'anon_key'),
    serviceRoleKey: get('SERVICE_ROLE_KEY', 'service_role_key'),
  }
}

/**
 * Returns the local stack's status, or null if `supabase status` fails
 * (stack not started). Never throws for a "not running" stack — throws only
 * for genuinely unexpected failures (CLI missing, malformed JSON).
 */
export function tryGetSupabaseStatus() {
  const result = spawnSync('npx', ['--yes', 'supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.status !== 0 || !result.stdout?.trim()) return null
  try {
    return readStatus(JSON.parse(result.stdout))
  } catch {
    return null
  }
}

export function startSupabase() {
  const result = spawnSync('npx', ['--yes', 'supabase', 'start'], { stdio: 'inherit', encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`\`supabase start\` failed (exit ${result.status})`)
  }
}

/** Polls GoTrue's health endpoint until it responds OK or the timeout elapses. */
export async function waitForHealth(apiUrl, { timeoutMs = 30_000, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/auth/v1/health`)
      if (response.ok) return
      lastError = new Error(`GoTrue health check returned ${response.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `Local Supabase stack at ${apiUrl} did not become healthy within ${timeoutMs}ms: ${lastError?.message ?? 'unknown error'}`,
  )
}

async function upsertFixtureUser(adminClient, dbClient, user) {
  const { rows } = await dbClient.query('SELECT id FROM auth.users WHERE email = $1', [user.email])
  let userId = rows[0]?.id

  if (!userId) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    })
    if (error) {
      throw new Error(`Failed to create fixture user ${user.email}: ${error.message}`)
    }
    userId = data.user.id
  }

  // The on_auth_user_created trigger (supabase/reset.sql) inserts a
  // public.users row with the default role in the same transaction as the
  // auth.users insert, so it's always present by the time we get here.
  await dbClient.query('UPDATE public.users SET role = $1 WHERE id = $2', [user.role, userId])

  if (user.role === 'artist') {
    await dbClient.query(
      `INSERT INTO public.artist_members (user_id, artist_id, member_role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (user_id, artist_id) DO NOTHING`,
      [userId, ARTIST_FIXTURE_ID],
    )
  }

  return userId
}

/** Ensures all FIXTURE_USERS exist with the right role/membership, creating
 * whichever are missing. Safe to call every run (idempotent). */
export async function ensureFixtureUsers(status) {
  const { Client } = pg
  const dbClient = new Client({ connectionString: status.dbUrl })
  await dbClient.connect()

  try {
    const adminClient = createClient(status.apiUrl, status.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Node 20 has no native WebSocket; supabase-js initializes a
      // RealtimeClient unconditionally even though we only use the admin
      // REST API here. Node 22+ wouldn't need this.
      realtime: { transport: ws },
    })

    for (const user of FIXTURE_USERS) {
      await upsertFixtureUser(adminClient, dbClient, user)
    }
  } finally {
    await dbClient.end()
  }
}
