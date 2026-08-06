/**
 * Ensures critical tables in supabase/reset.sql stay idempotent for existing DBs.
 *
 * Root cause class: columns added only inside CREATE TABLE IF NOT EXISTS never
 * land on production (no-op create) → PostgREST "column not found" → 500
 * (e.g. artists.hometown portal profile save).
 *
 * Modes:
 *   full        — every non-structural CREATE column needs ADD COLUMN IF NOT EXISTS
 *   create-once — only verify CREATE TABLE exists (table shipped as a unit; still
 *                 expand to full when the table starts evolving)
 *
 * Usage: node scripts/verify-schema-columns.mjs
 * Exit 0 = ok; 1 = drift.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const resetPath = join(root, 'supabase', 'reset.sql')

/** Always skip — table identity / timestamps / generated vectors. */
const STRUCTURAL_COLUMNS = new Set([
  'id',
  'created_at',
  'updated_at',
  'joined_at',
  'search_vector',
])

/**
 * Portal/admin critical tables.
 *
 * - full: every non-structural CREATE column needs ADD COLUMN IF NOT EXISTS
 *   (use for tables that evolved over time — artists / artist_epks).
 * - create-once: only assert CREATE TABLE exists. When you first ALTER a
 *   create-once table, switch it to full and add ADD COLUMN guards.
 */
const CRITICAL_TABLES = {
  artists: { mode: 'full' },
  artist_epks: { mode: 'full', extraStructural: ['artist_id'] },
  artist_private_data: { mode: 'create-once', extraStructural: ['artist_id'] },
  artist_members: { mode: 'create-once' },
  artist_billing_profiles: { mode: 'create-once' },
  artist_documents: { mode: 'create-once' },
  artist_landing_pages: { mode: 'create-once' },
  epk_fonts: { mode: 'create-once' },
  epk_share_links: { mode: 'create-once' },
  epk_versions: { mode: 'create-once' },
  portal_messages: { mode: 'create-once' },
}

function extractCreateTableBody(sql, table) {
  const markers = [
    `CREATE TABLE IF NOT EXISTS public.${table}`,
    `CREATE TABLE public.${table}`,
  ]
  for (const marker of markers) {
    const idx = sql.indexOf(marker)
    if (idx === -1) continue
    return extractParenBlock(sql, idx + marker.length)
  }
  return null
}

function extractParenBlock(sql, from) {
  const start = sql.indexOf('(', from)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return sql.slice(start + 1, i)
    }
  }
  return null
}

function parseCreateColumns(body) {
  const cols = []
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('--')) continue
    const upper = line.toUpperCase()
    if (
      upper.startsWith('CONSTRAINT') ||
      upper.startsWith('UNIQUE') ||
      upper.startsWith('PRIMARY') ||
      upper.startsWith('CHECK') ||
      upper.startsWith('FOREIGN') ||
      upper.startsWith('EXCLUDE')
    ) {
      continue
    }
    const m = line.match(/^([a-z_][a-z0-9_]*)\s+/i)
    if (m) cols.push(m[1].toLowerCase())
  }
  return cols
}

function parseAddColumns(sql, table) {
  const set = new Set()
  // Single-line and multi-line ALTER … ADD COLUMN IF NOT EXISTS
  const re = new RegExp(
    `ALTER\\s+TABLE\\s+public\\.${table}\\b[\\s\\S]{0,120}?ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+([a-z_][a-z0-9_]*)`,
    'gi',
  )
  let m
  while ((m = re.exec(sql)) !== null) {
    set.add(m[1].toLowerCase())
  }
  return set
}

function structuralFor(table, cfg) {
  const s = new Set(STRUCTURAL_COLUMNS)
  for (const c of cfg.extraStructural ?? []) s.add(c)
  return s
}

function main() {
  if (!existsSync(resetPath)) {
    console.error('[verify-schema-columns] Missing supabase/reset.sql')
    process.exit(1)
  }
  const sql = readFileSync(resetPath, 'utf8')
  const failures = []

  for (const [table, cfg] of Object.entries(CRITICAL_TABLES)) {
    const body = extractCreateTableBody(sql, table)
    if (!body) {
      failures.push({ table, error: 'CREATE TABLE not found in reset.sql' })
      continue
    }
    if (cfg.mode === 'create-once') continue

    const createCols = parseCreateColumns(body)
    const addCols = parseAddColumns(sql, table)
    const structural = structuralFor(table, cfg)
    const missing = createCols.filter((c) => !structural.has(c) && !addCols.has(c))
    if (missing.length > 0) {
      failures.push({
        table,
        missing,
        createCount: createCols.length,
        addCount: addCols.size,
      })
    }
  }

  if (failures.length === 0) {
    console.log(
      `[verify-schema-columns] OK — full coverage for: ${Object.keys(CRITICAL_TABLES).join(', ')}`,
    )
    process.exit(0)
  }

  console.error(
    '[verify-schema-columns] FAIL — CREATE columns without matching ADD COLUMN IF NOT EXISTS:',
  )
  for (const f of failures) {
    if (f.error) {
      console.error(`  • ${f.table}: ${f.error}`)
      continue
    }
    console.error(
      `  • ${f.table}: missing ${f.missing.length} (CREATE ${f.createCount}, ADD ${f.addCount})`,
    )
    console.error(`      ${f.missing.join(', ')}`)
  }
  console.error(
    '\nFix: add `ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS <col> …` in supabase/reset.sql',
  )
  process.exit(1)
}

main()
