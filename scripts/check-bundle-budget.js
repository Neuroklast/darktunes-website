import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BUILD_MANIFEST_PATH = path.join(ROOT, '.next', 'build-manifest.json')
const LEGACY_APP_BUILD_MANIFEST_PATH = path.join(ROOT, '.next', 'app-build-manifest.json')

/**
 * Budget thresholds (uncompressed bytes).
 *
 * Route budgets exclude the globally shared rootMainFiles so that only the
 * route-specific and route-level-shared JS is measured. Shared bundle has
 * its own separate budget.
 */
const budgets = {
  'shared bundle (rootMainFiles)': 450 * 1024,
  'app/page route-specific JS': 550 * 1024,
  // Raised after public artist DTO/security work + configurable video/news preview rows
  // (Show all control + media-query column math; ~586 KB observed in CI).
  'app/artists/[slug]/page route-specific JS': 600 * 1024,
}

/** Normalise a file path by stripping any leading slash. */
const normalisePath = (/** @type {string} */ f) => (f.startsWith('/') ? f.slice(1) : f)

/** Absolute file size on disk (uncompressed). Missing chunks are skipped. */
const fileSize = (/** @type {string} */ file) => {
  const fullPath = path.join(ROOT, '.next', normalisePath(file))
  if (!existsSync(fullPath)) return 0
  return statSync(fullPath).size
}

const buildManifest = JSON.parse(readFileSync(BUILD_MANIFEST_PATH, 'utf-8'))

/** Set of globally shared files from build-manifest rootMainFiles. */
const sharedFiles = new Set((buildManifest.rootMainFiles ?? []).map(normalisePath))

/** Extract unique static JS chunk paths referenced in a Next 16 client-reference manifest. */
const extractJsChunksFromClientReferenceManifest = (/** @type {string} */ manifestPath) => {
  if (!existsSync(manifestPath)) return []
  const content = readFileSync(manifestPath, 'utf-8')
  const matches = content.match(/static\/chunks\/[^/"']+\.js/g) ?? []
  return [...new Set(matches.map(normalisePath))]
}

/** Total size of a route's JS files, excluding globally shared chunks. */
const routeSizeFromLegacyManifest = (/** @type {Record<string, string[]>} */ appPages, /** @type {string} */ route) => {
  const files = appPages[`/${route}`] ?? appPages[route] ?? []
  return files
    .filter((f) => typeof f === 'string' && f.endsWith('.js') && !sharedFiles.has(normalisePath(f)))
    .reduce((total, file) => total + fileSize(file), 0)
}

const routeSizeFromClientReferenceManifest = (/** @type {string} */ route) => {
  const routeSegmentPath = route === 'page' ? '' : route.replace(/\/page$/, '')
  const manifestPath = path.join(
    ROOT,
    '.next',
    'server',
    'app',
    routeSegmentPath,
    'page_client-reference-manifest.js',
  )
  const files = extractJsChunksFromClientReferenceManifest(manifestPath)
  return files
    .filter((file) => file.endsWith('.js') && !sharedFiles.has(file))
    .reduce((total, file) => total + fileSize(file), 0)
}

const resolveRouteSize = (/** @type {string} */ route) => {
  if (existsSync(LEGACY_APP_BUILD_MANIFEST_PATH)) {
    const appBuildManifest = JSON.parse(readFileSync(LEGACY_APP_BUILD_MANIFEST_PATH, 'utf-8'))
    const appPages = appBuildManifest.pages ?? {}
    return routeSizeFromLegacyManifest(appPages, route)
  }
  return routeSizeFromClientReferenceManifest(route)
}

/** Total uncompressed size of all rootMainFiles shared chunks. */
const sharedBundleSize = (buildManifest.rootMainFiles ?? [])
  .filter((f) => f.endsWith('.js'))
  .reduce((total, file) => total + fileSize(file), 0)

const checks = [
  ['shared bundle (rootMainFiles)', sharedBundleSize],
  ['app/page route-specific JS', resolveRouteSize('page')],
  ['app/artists/[slug]/page route-specific JS', resolveRouteSize('artists/[slug]/page')],
]

let failed = false

for (const [name, size] of checks) {
  const budget = budgets[name]
  if (!budget) continue

  if (size > budget) {
    console.error(
      `❌ ${name}: ${(size / 1024).toFixed(1)} KB exceeds budget of ${(budget / 1024).toFixed(1)} KB`,
    )
    failed = true
  } else {
    console.info(
      `✅ ${name}: ${(size / 1024).toFixed(1)} KB is within budget of ${(budget / 1024).toFixed(1)} KB`,
    )
  }
}

if (failed) {
  process.exit(1)
}