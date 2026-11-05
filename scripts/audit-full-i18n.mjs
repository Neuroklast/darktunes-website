/**
 * Repository-wide static i18n inventory.
 * Reports suspicious user-visible literals without modifying application code.
 * CI checks missing translation keys separately in check-i18n-contract.mjs.
 *
 * npm run audit:i18n            human-readable inventory
 * npm run audit:i18n -- --json  machine-readable inventory
 *
 * Findings are candidates, NOT proof: product names, accessibility terms, test
 * fixture text and CMS-authored content sometimes must remain untranslated.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const roots = ['app', 'src/components', 'src/hooks']
const paths = []

function walk(folder) {
  const abs = path.join(root, folder)
  if (!fs.existsSync(abs)) return
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(folder.replace(/\\/g, '/'), entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'generated', '__snapshots__', '__fixtures__'].includes(entry.name)) walk(rel)
    } else if (/\.(?:tsx?|jsx?)$/.test(entry.name) && !/\.(?:test|spec)\.[jt]sx?$/.test(entry.name)) {
      paths.push(rel)
    }
  }
}
roots.forEach(walk)

function area(file) {
  if (file.startsWith('app/admin/') || file.startsWith('src/components/admin/')) return 'admin'
  if (file.startsWith('app/portal/') || file.startsWith('src/components/portal/')) return 'portal'
  if (file.startsWith('app/editor/') || file.startsWith('src/components/editor/')) return 'editor'
  if (file.startsWith('app/press/') || file.startsWith('src/components/press/')) return 'press'
  if (file.startsWith('app/api/')) return 'api'
  if (file.startsWith('src/components/')) return 'shared'
  return 'public'
}

function isCandidate(value) {
  const text = value.replace(/&[a-z]+;/gi, ' ').trim()
  if (text.length < 3 || text.length > 180) return false
  if (!/[a-zA-ZÀ-ÿÄÖÜäöüß]{3}/.test(text)) return false
  if (/^(?:https?:\/\/|\/|#|data:|mailto:|\.\/)/i.test(text)) return false
  if (/^[A-Z0-9_.\-\s]+$/.test(text) && text.length < 7) return false
  if (/\$\{|\{\{|\bclassName\b|\bfunction\b|=>|^\s*['"`]/.test(text)) return false
  if (/^(?:true|false|null|undefined|button|submit|reset|text|number|email|password|search|url|auto|none|open|closed)$/i.test(text)) return false
  return true
}

const patterns = [
  ['jsx-text', />([^<>{}\n]{3,180})<(?=[A-Za-z/])/g, 1],
  ['jsx-attribute', /\b(?:placeholder|aria-label|title|alt|label|heading|description|helperText|emptyMessage|buttonText|noResultsText|loadingText)\s*=\s*(?:\{\s*)?(['"`])([^'"`\n]{3,180})\1/g, 2],
  ['toast', /\btoast\.(?:success|error|warning|info)\(\s*(['"`])([^'"`\n]{3,180})\1/g, 2],
  ['dialog', /\b(?:window\.)?(?:confirm|alert|prompt)\(\s*(['"`])([^'"`\n]{3,180})\1/g, 2],
  ['format-locale', /\.toLocale(?:DateString|TimeString|String)\(\s*(['"])(?:de-DE|en-US|fr-FR)\1/g, null],
]
const rows = []
for (const file of paths) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const loc = area(file)
  // API error codes are localized at the UI boundary; HTTP routes are not UI.
  if (loc === 'api') continue
  for (const [kind, pattern, group] of patterns) {
    const regexp = new RegExp(pattern.source, pattern.flags)
    let found
    while ((found = regexp.exec(source)) !== null) {
      const value = group ? found[group].trim() : found[0]
      if (group && !isCandidate(value)) continue
      const line = source.slice(0, found.index).split('\n').length
      rows.push({ file, line, area: loc, kind, text: value.slice(0, 160) })
    }
  }
}
const aggregate = {}
for (const row of rows) {
  const target = aggregate[row.area] ??= { files: new Set(), counts: {} }
  target.files.add(row.file)
  target.counts[row.kind] = (target.counts[row.kind] ?? 0) + 1
}
const summary = Object.fromEntries(Object.entries(aggregate).map(([name, data]) =>
  [name, { files: data.files.size, ...data.counts }]))
const byFile = new Map()
for (const row of rows) {
  if (!byFile.has(row.file)) byFile.set(row.file, [])
  byFile.get(row.file).push(row)
}
const worst = [...byFile.entries()].sort((a,b) => b[1].length - a[1].length)
const report = {
  filesScanned: paths.length, totalCandidates: rows.length, summary,
  topFiles: worst.slice(0, 40).map(([file, candidates]) => ({
    file, count: candidates.length, samples: candidates.slice(0, 5),
  })),
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`[i18n audit] scanned ${report.filesScanned} source files; ${report.totalCandidates} possible user-visible literals`)
  for (const [name, counts] of Object.entries(summary)) console.log(`  ${name}: ${JSON.stringify(counts)}`)
  console.log('Top candidates:')
  for (const item of report.topFiles) {
    console.log(`  ${item.file}: ${item.count}`)
    for (const hit of item.samples.slice(0, 3)) console.log(`    L${hit.line} [${hit.kind}] ${JSON.stringify(hit.text)}`)
  }
  console.log('[i18n audit] heuristic results require review; namespace parity is enforced by check:i18n')
}
