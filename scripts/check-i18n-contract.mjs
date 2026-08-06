/**
 * Enterprise i18n contract (CI).
 *
 * Fails on:
 * 1. en/de key-tree parity for portal + admin (and nested leaves)
 * 2. Static t('key') / tToast('key') / portalKey('key') missing from dictionaries
 * 3. Hardcoded toast.*( '…' ) / window.confirm( '…' ) user-facing English in scoped UI
 * 4. ROUTE_BUNDLES missing portal on /admin and /editor (shared portal components)
 *
 * Optional baseline for residual non-toast hardcoding:
 *   scripts/i18n-hardcode-baseline.json  (paths that may still contain placeholders)
 *   --write-baseline  rewrite baseline from current residual findings
 *
 * Usage:
 *   node scripts/check-i18n-contract.mjs
 *   node scripts/check-i18n-contract.mjs --write-baseline
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const writeBaseline = process.argv.includes('--write-baseline')

const UI_GLOBS = [
  'app/portal',
  'app/admin',
  'app/login',
  'src/components/admin',
  'src/components/portal',
]

function walk(d, acc = []) {
  const abs = path.join(root, d)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.next'].includes(e.name)) continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx'))
      acc.push(p)
  }
  return acc
}

function flatKeys(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatKeys(v, key, out)
    else out.add(key)
  }
  return out
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
}

function rel(p) {
  return p.replace(/\\/g, '/')
}

const errors = []
const warnings = []

// ── 1. Parity ──────────────────────────────────────────────────────────────
const portalEn = loadJson('src/i18n/messages/en/portal.json')
const portalDe = loadJson('src/i18n/messages/de/portal.json')
const portalFr = loadJson('src/i18n/messages/fr/portal.json')
const adminEn = loadJson('src/i18n/messages/en/admin.json')
const adminDe = loadJson('src/i18n/messages/de/admin.json')
const adminFr = loadJson('src/i18n/messages/fr/admin.json')

const pairs = [
  ['portal.de', portalEn, portalDe],
  ['portal.fr', portalEn, portalFr],
  ['admin.de', adminEn, adminDe],
  ['admin.fr', adminEn, adminFr],
]

for (const [name, en, de] of pairs) {
  const enK = flatKeys(en)
  const deK = flatKeys(de)
  for (const k of enK) {
    if (!deK.has(k)) errors.push(`[parity] ${name} missing in de: ${k}`)
  }
  for (const k of deK) {
    if (!enK.has(k)) errors.push(`[parity] ${name} missing in en: ${k}`)
  }
}

// ── 2. ROUTE_BUNDLES must load portal on admin/editor ─────────────────────
const loadMessagesSrc = fs.readFileSync(path.join(root, 'src/i18n/loadMessages.ts'), 'utf8')
if (!/['"]\/admin['"]\s*:\s*\[[^\]]*['"]portal['"]/.test(loadMessagesSrc)) {
  errors.push('[bundle] ROUTE_BUNDLES["/admin"] must include "portal" (shared EventManager etc.)')
}
if (!/['"]\/editor['"]\s*:\s*\[[^\]]*['"]portal['"]/.test(loadMessagesSrc)) {
  errors.push('[bundle] ROUTE_BUNDLES["/editor"] must include "portal"')
}

// ── 3. Static key references ───────────────────────────────────────────────
const files = UI_GLOBS.flatMap((g) => walk(g))
const reNs = /useTranslations\(\s*['"]([\w.]+)['"]\s*\)/g
const reT = /\bt(?:Toast)?\(\s*['"]([\w.]+)['"]/g
const rePortalKey = /portalKey\(\s*['"]([\w.]+)['"]\s*\)/g

const portalFlat = flatKeys(portalEn)
const adminFlat = flatKeys(adminEn)

for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8')
  const namespaces = [...src.matchAll(reNs)].map((m) => m[1])
  if (!namespaces.length && !src.includes('portalKey')) continue

  // Collect keys used with t / tToast
  const keys = new Set()
  for (const m of src.matchAll(reT)) keys.add(m[1])
  for (const m of src.matchAll(rePortalKey)) keys.add(m[1])

  for (const key of keys) {
    if (key.includes('${')) continue
    // Determine dictionary from namespaces used in file
    const hasPortal = namespaces.some((n) => n === 'portal' || n.startsWith('portal.'))

    if (namespaces.includes('admin.toast') || namespaces.includes('portal.toast')) {
      // tToast keys under toast ns
      if (src.includes(`tToast('${key}')`) || src.includes(`tToast("${key}")`)) {
        if (namespaces.includes('admin.toast') && !adminFlat.has(`toast.${key}`) && !adminFlat.has(key)) {
          // admin.toast key is leaf under toast.
          if (!adminFlat.has(`toast.${key}`)) {
            errors.push(`[key] ${rel(f)} admin.toast missing: ${key}`)
          }
        }
        if (namespaces.includes('portal') && key.startsWith('toast_') && !portalFlat.has(key)) {
          errors.push(`[key] ${rel(f)} portal missing: ${key}`)
        }
      }
    }

    // portalKey / t under useTranslations('portal')
    if (hasPortal && !key.includes('.') && !key.startsWith('toast_')) {
      // only check when useTranslations('portal') without subpath
      if (namespaces.includes('portal') && !portalFlat.has(key) && !adminFlat.has(key)) {
        // portalKey may pass dynamic nav labels — if not in portal, flag
        if (src.includes(`portalKey`) || /\bt\(\s*['"]/.test(src)) {
          // skip if only used with admin
          if (namespaces.includes('portal') && !portalFlat.has(key)) {
            // allow errors.* via useTranslations('errors')
            if (!namespaces.includes('errors')) {
              // soft: only hard-fail keys that appear as t('exact')
              const usedAsT = new RegExp(`\\bt\\(\\s*['"]${key}['"]`).test(src)
              const usedAsPortalKey = new RegExp(`portalKey\\(\\s*['"]${key}['"]`).test(src)
              if ((usedAsT || usedAsPortalKey) && !portalFlat.has(key)) {
                errors.push(`[key] ${rel(f)} portal missing key: ${key}`)
              }
            }
          }
        }
      }
    }

    // admin nested: t('events.pageTitle') with useTranslations('admin')
    if (namespaces.includes('admin') && key.includes('.')) {
      if (!adminFlat.has(key) && !key.startsWith('nav.')) {
        // many admin keys are nested
        if (!adminFlat.has(key)) {
          // only flag if t('a.b') pattern
          if (new RegExp(`\\bt\\(\\s*['"]${key.replace(/\./g, '\\.')}['"]`).test(src)) {
            if (!adminFlat.has(key)) errors.push(`[key] ${rel(f)} admin missing key: ${key}`)
          }
        }
      }
    }
  }

  // tToast key existence for admin.toast
  if (src.includes("useTranslations('admin.toast')") || src.includes('useTranslations("admin.toast")')) {
    for (const m of src.matchAll(/tToast\(\s*['"]([\w.]+)['"]/g)) {
      const k = m[1]
      if (!adminFlat.has(`toast.${k}`)) {
        errors.push(`[key] ${rel(f)} admin.toast missing: ${k}`)
      }
    }
  }
  if (src.includes("useTranslations('portal')") && src.includes('tToast(')) {
    for (const m of src.matchAll(/tToast\(\s*['"]([\w.]+)['"]/g)) {
      const k = m[1]
      if (!portalFlat.has(k)) {
        errors.push(`[key] ${rel(f)} portal missing toast key: ${k}`)
      }
    }
  }
}

// ── 4. Hardcoded toast / confirm (strict zero) ─────────────────────────────
const toastLitRe =
  /toast\.(success|error|info|warning)\(\s*(['"])(?!tToast|t\()((?:(?!\2).)+)\2/g
const confirmLitRe = /window\.confirm\(\s*(['"])(?!tToast|t\()((?:(?!\1).)+)\1/g

const hardcodeHits = []
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8')
  let m
  const toastRe = new RegExp(toastLitRe.source, 'g')
  while ((m = toastRe.exec(src))) {
    const lit = m[3]
    if (/^https?:/.test(lit)) continue
    // allow template-looking leftovers that are only punctuation
    if (lit.trim().length < 2) continue
    // dynamic-only concat patterns still have English base — flag them
    hardcodeHits.push({ file: rel(f), kind: 'toast', text: lit.slice(0, 100) })
  }
  const confRe = new RegExp(confirmLitRe.source, 'g')
  while ((m = confRe.exec(src))) {
    hardcodeHits.push({ file: rel(f), kind: 'confirm', text: m[2].slice(0, 100) })
  }
}

for (const h of hardcodeHits) {
  errors.push(`[hardcode-${h.kind}] ${h.file}: ${JSON.stringify(h.text)}`)
}

// ── 5. Residual UI hardcode baseline (growth guard) ────────────────────────
const residualRe =
  /(?:heading|description|placeholder|aria-label|title)\s*=\s*(?:\{\s*)?['"]([A-Za-z][^'"]{4,})['"]/g
const residual = []
for (const f of files) {
  // skip pure form placeholder "e.g. …" noise in CMS forms optionally — still count
  const src = fs.readFileSync(path.join(root, f), 'utf8')
  let m
  const re = new RegExp(residualRe.source, 'g')
  while ((m = re.exec(src))) {
    const text = m[1]
    if (/^https?:/.test(text)) continue
    if (/^[a-z0-9_.-]+$/i.test(text) && text.includes('_')) continue
    residual.push(`${rel(f)}::${text}`)
  }
}

const baselinePath = path.join(root, 'scripts/i18n-hardcode-baseline.json')
if (writeBaseline) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ generatedAt: new Date().toISOString(), items: residual.sort() }, null, 2) +
      '\n',
  )
  console.log(`[i18n] wrote baseline ${residual.length} residual UI hardcodes`)
} else if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  const baseSet = new Set(baseline.items || [])
  const current = new Set(residual)
  const added = [...current].filter((x) => !baseSet.has(x))
  const removed = [...baseSet].filter((x) => !current.has(x))
  if (added.length) {
    for (const a of added.slice(0, 50)) {
      errors.push(`[hardcode-growth] new UI hardcode (not in baseline): ${a}`)
    }
    if (added.length > 50) errors.push(`[hardcode-growth] …and ${added.length - 50} more`)
  }
  if (removed.length) {
    warnings.push(
      `[hardcode-baseline] ${removed.length} items fixed — re-run with --write-baseline to shrink allowlist`,
    )
  }
} else {
  warnings.push(
    '[hardcode-baseline] missing scripts/i18n-hardcode-baseline.json — run with --write-baseline once',
  )
}

// ── Report ─────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(w)
if (errors.length) {
  console.error(`\ni18n contract FAILED (${errors.length} issue(s)):\n`)
  for (const e of errors.slice(0, 80)) console.error('  ' + e)
  if (errors.length > 80) console.error(`  …and ${errors.length - 80} more`)
  process.exit(1)
}

console.log(
  `[i18n] OK — parity, bundles, key refs, zero toast/confirm hardcodes${fs.existsSync(baselinePath) ? ', baseline growth check' : ''}`,
)
