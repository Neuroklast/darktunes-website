/**
 * CI guard: no hardcoded tenant brand strings in brand foundation paths.
 *
 * Scope expands as migration PRs land. Run with --strict to scan app/ + src/.
 */

import fs from 'fs'
import path from 'path'
const root = process.cwd()
const pattern = String.raw`darktunes|darkTunes|DarkTunes`
const strict = process.argv.includes('--strict')

const scopedPaths = strict
  ? ['app', 'src', 'supabase/reset.sql', 'supabase/functions', 'tests']
  : [
      'src/lib/brand',
      'src/lib/seo',
      'src/lib/api/siteSettings.ts',
      'src/hooks/useSiteSettings.ts',
      'supabase/reset.sql',
      'tests/unit/lib/brand.test.ts',
      'app/layout.tsx',
      'app/manifest.ts',
      'app/sitemap.ts',
      'app/robots.ts',
      'app/llms.txt',
      'app/about',
      'app/artists',
      'app/contact',
      'app/events',
      'app/news',
      'app/newsletter',
      'app/releases',
      'app/videos',
      'app/login/page.tsx',
      'app/offline',
      'app/fan',
      'app/epk',
      'app/press/page.tsx',
      'app/press/apply/page.tsx',
      'app/press/dashboard/layout.tsx',
      'app/press/releases',
      'app/admin/layout.tsx',
      'app/editor/layout.tsx',
      'app/promo-pool/layout.tsx',
      'app/portal/layout.tsx',
      'app/portal/billing',
      'app/portal/invoices',
      'app/portal/statements',
      'app/portal/epk-builder',
      'app/portal/fan-page',
      'app/portal/accept-invite',
      'app/portal/_components',
      'app/_components/Providers.tsx',
      'app/_components/SiteHeader.tsx',
      'app/login/_components/CentralLoginForm.tsx',
      'src/components/Header.tsx',
      'src/components/Footer.tsx',
      'src/components/brand',
      'src/components/PWAInstallPrompt.tsx',
      'src/components/admin/AdminSidebarNav.tsx',
      'src/components/admin/AdminDashboard.tsx',
      'src/components/portal/PortalMailbox.tsx',
      'src/i18n/messages',
      'src/i18n/resolveBrandPlaceholders.ts',
      'src/i18n/request.ts',
      'src/lib/brand/i18nValues.ts',
    ]

/** Paths that may reference legacy darktunes_* identifiers during migration. */
const lineAllowPatterns = [
  /LEGACY_/,
  /legacy/i,
  /darktunes_\*/,
  /Migration/,
  // Org #0 seed + multi-tenant docs: slug/host for default label (not UI brand strings)
  /Org #0/,
  /DEFAULT_ORGANIZATION/,
  /INSERT INTO public\.organizations/,
  /Sentinel UUID/,
  // Multi-line VALUES row for Org #0 seed (id + slug darktunes)
  /00000000-0000-0000-0000-000000000000/,
]

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function isAllowedLine(line) {
  return lineAllowPatterns.some((re) => re.test(line))
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const violations = []
  for (const [index, line] of content.split('\n').entries()) {
    if (!new RegExp(pattern, 'i').test(line)) continue
    if (isAllowedLine(line)) continue
    violations.push({ file: rel(filePath), line: index + 1, text: line.trim() })
  }
  return violations
}

function collectFiles(target) {
  const abs = path.join(root, target)
  if (!fs.existsSync(abs)) return []
  const stat = fs.statSync(abs)
  if (stat.isFile()) return [abs]
  const files = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(rel(full)))
    else if (/\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) files.push(full)
  }
  return files
}

const violations = []
for (const target of scopedPaths) {
  for (const file of collectFiles(target)) {
    violations.push(...scanFile(file))
  }
}

if (violations.length > 0) {
  console.error(`\nBrand contract violations (${violations.length}):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: ${v.text}`)
  }
  console.error(`\nScoped paths: ${scopedPaths.join(', ')}`)
  console.error('Use site_settings / getBrandContext() instead of hardcoded brand strings.\n')
  process.exit(1)
}

console.log(
  `Brand contract OK (${scopedPaths.length} scope${scopedPaths.length === 1 ? '' : 's'}, 0 violations)`,
)