/**
 * src/supabase/reset-sql.test.ts
 *
 * Static-analysis tests for supabase/reset.sql.
 *
 * These tests run entirely in Node — no database connection required.
 * They guard against a class of ordering / idempotency bugs that are easy
 * to introduce when adding new tables or columns to reset.sql:
 *
 *   • Every `ALTER TABLE X ENABLE ROW LEVEL SECURITY` must come AFTER
 *     the corresponding `CREATE TABLE IF NOT EXISTS X`.
 *
 *   • Every `ALTER TABLE X ADD COLUMN IF NOT EXISTS colname` must
 *     reference a table that has a `CREATE TABLE IF NOT EXISTS X` somewhere
 *     in the file (so the ALTER is never orphaned).
 *
 *   • Common non-idempotent patterns (bare CREATE TABLE, bare ALTER TYPE ADD
 *     without a DO-block guard, etc.) must not appear.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const SQL_PATH = resolve(__dirname, '../../supabase/reset.sql')

function loadLines(): string[] {
  return readFileSync(SQL_PATH, 'utf-8').split('\n')
}

/** Strip inline SQL comments and trim whitespace from a line. */
function stripComment(line: string): string {
  const idx = line.indexOf('--')
  return (idx >= 0 ? line.slice(0, idx) : line).trim()
}

// ---------------------------------------------------------------------------
// Parse the SQL file once and build a lookup of the first line number for
// each CREATE TABLE and ALTER TABLE operation.
// ---------------------------------------------------------------------------
interface TablePosition {
  createLine: number | undefined
  enableRlsLine: number | undefined
  addColumnLines: { column: string; line: number }[]
}

function parseResetSql(): Map<string, TablePosition> {
  const lines = loadLines()
  const tables = new Map<string, TablePosition>()

  function get(table: string): TablePosition {
    if (!tables.has(table)) {
      tables.set(table, { createLine: undefined, enableRlsLine: undefined, addColumnLines: [] })
    }
    return tables.get(table)!
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const clean = stripComment(lines[i])

    // CREATE TABLE IF NOT EXISTS public.<name>
    let m = clean.match(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.(\w+)/i)
    if (m) {
      const pos = get(m[1])
      if (pos.createLine === undefined) pos.createLine = lineNo
      continue
    }

    // ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY
    m = clean.match(/^ALTER\s+TABLE\s+public\.(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    if (m) {
      const pos = get(m[1])
      if (pos.enableRlsLine === undefined) pos.enableRlsLine = lineNo
      continue
    }

    // ALTER TABLE public.<name> ADD COLUMN IF NOT EXISTS <colname>
    m = clean.match(/^ALTER\s+TABLE\s+public\.(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)/i)
    if (m) {
      get(m[1]).addColumnLines.push({ column: m[2], line: lineNo })
      continue
    }
  }

  return tables
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('supabase/reset.sql — static analysis', () => {
  const tables = parseResetSql()
  const lines = loadLines()

  // ── Ordering: ENABLE RLS must come after CREATE TABLE ──────────────────
  it('ALTER TABLE … ENABLE ROW LEVEL SECURITY always comes after CREATE TABLE', () => {
    const violations: string[] = []

    for (const [table, pos] of tables) {
      if (pos.enableRlsLine === undefined) continue // no RLS statement — not an error
      if (pos.createLine === undefined) {
        violations.push(
          `Table "${table}" has ENABLE ROW LEVEL SECURITY at line ${pos.enableRlsLine} but no CREATE TABLE IF NOT EXISTS found`,
        )
        continue
      }
      if (pos.enableRlsLine < pos.createLine) {
        violations.push(
          `Table "${table}": ENABLE ROW LEVEL SECURITY at line ${pos.enableRlsLine} comes BEFORE CREATE TABLE at line ${pos.createLine}`,
        )
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── ADD COLUMN IF NOT EXISTS must reference an existing CREATE TABLE ────
  it('ALTER TABLE … ADD COLUMN IF NOT EXISTS references a known CREATE TABLE', () => {
    const violations: string[] = []

    for (const [table, pos] of tables) {
      for (const { column, line } of pos.addColumnLines) {
        if (pos.createLine === undefined) {
          violations.push(
            `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" at line ${line} references a table with no CREATE TABLE IF NOT EXISTS`,
          )
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── No bare CREATE TABLE (without IF NOT EXISTS) ────────────────────────
  it('all CREATE TABLE statements use IF NOT EXISTS (idempotency)', () => {
    const violations: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const clean = stripComment(lines[i])
      // Match CREATE TABLE that is NOT followed by IF NOT EXISTS
      if (/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(clean)) {
        violations.push(`Line ${i + 1}: bare CREATE TABLE (missing IF NOT EXISTS): ${lines[i].trim()}`)
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── CREATE TYPE should be idempotent (IF NOT EXISTS or DO block) ────────
  it('all CREATE TYPE statements are idempotent', () => {
    const violations: string[] = []
    let insideDoBlock = false
    let doBlockHasException = false
    // Collects CREATE TYPE lines inside the current DO block; flushed on END $$
    const pendingDoBlockChecks: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const clean = stripComment(lines[i])

      if (/^\s*DO\s+\$\$/i.test(lines[i])) {
        insideDoBlock = true
        doBlockHasException = false
        pendingDoBlockChecks.length = 0
      }

      if (insideDoBlock && /EXCEPTION\s+WHEN\s+duplicate_object/i.test(clean)) {
        doBlockHasException = true
      }

      // Process END $$ after checking EXCEPTION so a same-line "EXCEPTION … END $$" works
      if (insideDoBlock && /END\s+\$\$/i.test(lines[i])) {
        insideDoBlock = false
        if (!doBlockHasException) {
          violations.push(...pendingDoBlockChecks)
        }
        pendingDoBlockChecks.length = 0
      }

      if (/^CREATE\s+TYPE\b/i.test(clean)) {
        const hasIfNotExists = /^CREATE\s+TYPE\s+IF\s+NOT\s+EXISTS\b/i.test(clean)

        if (!hasIfNotExists && !insideDoBlock) {
          violations.push(`Line ${i + 1}: CREATE TYPE without IF NOT EXISTS or DO block: ${lines[i].trim()}`)
        }

        if (insideDoBlock) {
          pendingDoBlockChecks.push(`Line ${i + 1}: CREATE TYPE in DO block without EXCEPTION WHEN duplicate_object: ${lines[i].trim()}`)
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── No bare ALTER TYPE … ADD VALUE (must be guarded in a DO block) ─────
  it('all ALTER TYPE … ADD VALUE statements are inside DO blocks (idempotency)', () => {
    const violations: string[] = []
    let insideDoBlock = false

    for (let i = 0; i < lines.length; i++) {
      const clean = stripComment(lines[i])
      if (/^\s*DO\s+\$\$/i.test(lines[i])) insideDoBlock = true
      if (insideDoBlock && /END\s+\$\$/i.test(lines[i])) insideDoBlock = false

      if (!insideDoBlock && /ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE/i.test(clean)) {
        violations.push(
          `Line ${i + 1}: bare ALTER TYPE … ADD VALUE outside a DO block (not idempotent): ${lines[i].trim()}`,
        )
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── CREATE INDEX statements use IF NOT EXISTS ───────────────────────────
  it('all CREATE INDEX statements use IF NOT EXISTS (idempotency)', () => {
    const violations: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const clean = stripComment(lines[i])
      if (/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(clean)) {
        violations.push(`Line ${i + 1}: CREATE INDEX without IF NOT EXISTS: ${lines[i].trim()}`)
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── Every table that has RLS policies is known ──────────────────────────
  it('all DROP POLICY / CREATE POLICY statements reference a known CREATE TABLE', () => {
    const violations: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const clean = stripComment(lines[i])
      // DROP POLICY … ON public.<table> or CREATE POLICY … ON public.<table>
      const m = clean.match(/(?:DROP|CREATE)\s+POLICY\b.*\bON\s+public\.(\w+)/i)
      if (m) {
        const table = m[1]
        if (!tables.has(table) || tables.get(table)!.createLine === undefined) {
          violations.push(
            `Line ${i + 1}: POLICY on "${table}" but no CREATE TABLE IF NOT EXISTS found`,
          )
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  // ── news_posts must contain artist_id in the CREATE TABLE body ──────────
  it('news_posts CREATE TABLE includes artist_id column', () => {
    let inNewsPostsCreate = false
    let depth = 0
    let found = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const clean = stripComment(line)

      if (/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.news_posts/i.test(clean)) {
        inNewsPostsCreate = true
        depth = 0
      }

      if (inNewsPostsCreate) {
        if (line.includes('(')) depth++
        if (line.includes(')')) depth--
        if (/\bartist_id\b/.test(clean)) found = true
        if (depth === 0 && inNewsPostsCreate && i > 0) {
          inNewsPostsCreate = false
        }
      }
    }

    expect(found).toBe(true)
  })

  it('never calls public.has_permission with auth.uid() as first argument', () => {
    const violations: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const clean = stripComment(lines[i])
      if (/public\.has_permission\s*\(\s*auth\.uid\(\)\s*,/i.test(clean)) {
        violations.push(`Line ${i + 1}: invalid has_permission signature usage: ${lines[i].trim()}`)
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  it('defines get_my_role, role_permissions, and has_permission before the tables section', () => {
    const getMyRoleLine = lines.findIndex((line) =>
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_my_role\(\)/i.test(stripComment(line)),
    )
    const rolePermissionsLine = lines.findIndex((line) =>
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.role_permissions/i.test(stripComment(line)),
    )
    const hasPermissionLine = lines.findIndex((line) =>
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_permission\(perm\s+TEXT\)/i.test(stripComment(line)),
    )
    const usersCreateLine = lines.findIndex((line) =>
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.users/i.test(stripComment(line)),
    )

    expect(getMyRoleLine).toBeGreaterThanOrEqual(0)
    expect(rolePermissionsLine).toBeGreaterThanOrEqual(0)
    expect(hasPermissionLine).toBeGreaterThanOrEqual(0)
    expect(usersCreateLine).toBeGreaterThanOrEqual(0)
    expect(getMyRoleLine).toBeLessThan(usersCreateLine)
    expect(rolePermissionsLine).toBeLessThan(usersCreateLine)
    expect(hasPermissionLine).toBeLessThan(usersCreateLine)
  })

  it('defines full UNIQUE constraints for release external IDs (PostgREST upsert)', () => {
    const sql = readFileSync(SQL_PATH, 'utf-8')
    expect(sql).toMatch(/ADD CONSTRAINT releases_spotify_id_key UNIQUE \(spotify_id\)/)
    expect(sql).toMatch(/ADD CONSTRAINT releases_discogs_id_key UNIQUE \(discogs_id\)/)
    expect(sql).toMatch(
      /ALTER TABLE public\.releases DROP CONSTRAINT IF EXISTS releases_spotify_id_key/,
    )
    expect(sql).toMatch(
      /ALTER TABLE public\.releases DROP CONSTRAINT IF EXISTS releases_discogs_id_key/,
    )
    expect(sql).toMatch(
      /DROP INDEX IF EXISTS public\.releases_spotify_id_key[\s\S]*WHEN dependent_objects_still_exist THEN NULL/,
    )
  })

  it('defines Apify Spotify play snapshot + usage tables with RLS enable', () => {
    const sql = readFileSync(SQL_PATH, 'utf-8')
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.spotify_track_play_snapshots/,
    )
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.apify_usage_months/)
    expect(sql).toMatch(
      /source IN \('lastfm', 'soundcharts', 'apify'\)/,
    )
    expect(sql).toMatch(
      /metric_type IN \('listeners', 'plays', 'followers'\)/,
    )
    expect(sql).toMatch(
      /ALTER TABLE public\.spotify_track_play_snapshots ENABLE ROW LEVEL SECURITY/,
    )
    expect(sql).toMatch(
      /ALTER TABLE public\.apify_usage_months\s+ENABLE ROW LEVEL SECURITY/,
    )
    expect(sql).toMatch(/apify_usage_months_pkey PRIMARY KEY \(organization_id, year_month\)/)
    expect(sql).toMatch(/financial_audit_events.*organization_id|idx_financial_audit_organization_id/)
  })

  it('guards artists CREATE columns with ADD COLUMN IF NOT EXISTS (prod CREATE is a no-op)', () => {
    // CREATE TABLE IF NOT EXISTS does not add new columns on live DBs.
    // SSOT: every non-structural artists column must appear in the idempotent
    // ALTER block — enforced by `npm run verify:schema-columns` for the full set.
    // apple_music_url is the historical canary (once CREATE-only; caused drift).
    const hasAppleMusicGuard = lines.some((line) =>
      /^ALTER\s+TABLE\s+public\.artists\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+apple_music_url\b/i.test(
        stripComment(line),
      ),
    )
    const hasHometownGuard = lines.some((line) =>
      /^ALTER\s+TABLE\s+public\.artists\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+hometown\b/i.test(
        stripComment(line),
      ),
    )
    expect(hasAppleMusicGuard).toBe(true)
    expect(hasHometownGuard).toBe(true)
  })
})
