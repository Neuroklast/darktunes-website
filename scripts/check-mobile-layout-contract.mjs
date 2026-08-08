/**
 * CI guard: multi-column dashboard builders must not rely on CSS alone to hide
 * `react-resizable-panels` on small viewports.
 *
 * Root cause (EPK / Fan Page builders): `ResizablePanelGroup` / `Group` sets
 * inline `display: flex`, which wins over Tailwind `hidden` / `lg:flex`.
 * Mobile tabs then paint *alongside* the desktop three-column layout.
 *
 * Rules:
 * 1. Anti-pattern: any file with ResizablePanelGroup + className hidden+lg:flex
 *    (CSS cannot hide the library's inline display).
 * 2. Portal builders (`epk-builder`, `fan-page`) must gate with useIsLg/useMediaQuery
 *    and mount ResizablePanelGroup only when isLg.
 * 3. Portal full-bleed tools (epk-builder, fan-page) must lockScroll + p-0 in
 *    app/portal/layout.tsx.
 * 4. Public Footer legal row must flex-wrap and use min-h-[44px] touch targets.
 */

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const errors = []

function walk(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walk(full))
    else if (/\.(tsx|ts)$/.test(entry.name)) results.push(full)
  }
  return results
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function hasHiddenLgFlexAntiPattern(content) {
  if (!content.includes('ResizablePanelGroup')) return false
  // className="hidden … lg:flex" or cn('hidden', 'lg:flex') near ResizablePanelGroup
  return (
    /className=\{?["'`][^"'`]*\bhidden\b[^"'`]*\blg:flex\b/.test(content) ||
    /className=\{?["'`][^"'`]*\blg:flex\b[^"'`]*\bhidden\b/.test(content) ||
    content.includes('hidden min-h-0 flex-1 lg:flex') ||
    content.includes('"hidden min-h-0 flex-1 lg:flex"') ||
    content.includes("'hidden min-h-0 flex-1 lg:flex'") ||
    content.includes('`hidden min-h-0 flex-1 lg:flex`')
  )
}

// --- Rule 1: ban CSS-only hide of ResizablePanelGroup ---
for (const file of walk(path.join(root, 'src'))) {
  const content = fs.readFileSync(file, 'utf8')
  if (hasHiddenLgFlexAntiPattern(content)) {
    errors.push(
      `${rel(file)}: ResizablePanelGroup uses className hidden+lg:flex — mount the group only when isLg (inline display:flex ignores Tailwind hidden)`,
    )
  }
}
for (const file of walk(path.join(root, 'app'))) {
  const content = fs.readFileSync(file, 'utf8')
  if (hasHiddenLgFlexAntiPattern(content)) {
    errors.push(
      `${rel(file)}: ResizablePanelGroup uses className hidden+lg:flex — mount the group only when isLg (inline display:flex ignores Tailwind hidden)`,
    )
  }
}

// --- Rule 2: portal multi-column builders must use useIsLg ---
const builderDirs = [
  path.join(root, 'src/components/epk-builder'),
  path.join(root, 'src/components/fan-page'),
]
for (const dir of builderDirs) {
  for (const file of walk(dir)) {
    if (!file.endsWith('Shell.tsx')) continue
    const content = fs.readFileSync(file, 'utf8')
    if (!content.includes('ResizablePanelGroup')) continue
    if (!content.includes('useIsLg') && !content.includes('useMediaQuery')) {
      errors.push(
        `${rel(file)}: multi-column builder shell must use useIsLg()/useMediaQuery() and only mount ResizablePanelGroup when desktop`,
      )
    }
    // Must not always render the group (require isLg conditional)
    if (
      content.includes('ResizablePanelGroup') &&
      !content.includes('isLg') &&
      !content.includes('isDesktop')
    ) {
      errors.push(
        `${rel(file)}: ResizablePanelGroup must be gated on isLg (conditional mount)`,
      )
    }
  }
}

// --- Rule 3: Portal full-bleed builders ---
const portalLayout = path.join(root, 'app/portal/layout.tsx')
if (fs.existsSync(portalLayout)) {
  const content = fs.readFileSync(portalLayout, 'utf8')
  if (!content.includes('/portal/epk-builder')) {
    errors.push(`${rel(portalLayout)}: must detect /portal/epk-builder for full-bleed shell`)
  }
  if (!content.includes('/portal/fan-page')) {
    errors.push(`${rel(portalLayout)}: must detect /portal/fan-page for full-bleed shell`)
  }
  if (!content.includes('lockScroll')) {
    errors.push(
      `${rel(portalLayout)}: full-bleed portal builders require lockScroll + p-0 for epk-builder and fan-page`,
    )
  }
}

// --- Rule 4: Footer legal touch targets ---
const footer = path.join(root, 'src/components/Footer.tsx')
if (fs.existsSync(footer)) {
  const content = fs.readFileSync(footer, 'utf8')
  if (!content.includes('flex-wrap')) {
    errors.push(`${rel(footer)}: legal/footer link row must flex-wrap on mobile`)
  }
  if (!content.includes('min-h-[44px]')) {
    errors.push(`${rel(footer)}: legal links need min-h-[44px] touch targets (WCAG)`)
  }
  if (content.includes('overflow-x-hidden') && /flex gap-6/.test(content) && !content.includes('flex-wrap')) {
    errors.push(
      `${rel(footer)}: overflow-x-hidden + non-wrapping flex gap-6 clips Impressum/legal links on mobile`,
    )
  }
}

if (errors.length > 0) {
  console.error('Mobile layout contract failed:\n')
  for (const err of errors) console.error(`  • ${err}`)
  console.error(`\n${errors.length} error(s). See docs/agent/frontend.md (mobile builders).`)
  process.exit(1)
}

console.log('Mobile layout contract OK.')
