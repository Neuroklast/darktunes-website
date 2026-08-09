/**
 * Static API contract checks for app/api route.ts files.
 *
 * Phase B foundation (API SOTA program):
 *  1. Every route handler file uses withErrorHandler (or is a pure re-export)
 *  2. Portal mutations have a recognized portal auth pattern
 *  3. Admin routes have a recognized admin auth pattern OR //@api-public annotation
 *
 * Later phases tighten (e.g. require portalMemberWrite for all portal writes).
 *
 * Usage: node scripts/verify-api-contracts.mjs
 * Exit 0 = ok; 1 = violations.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const apiDir = join(root, 'app', 'api')

/** Pure re-exports — no local handler body. */
const REEXPORT_ALLOWLIST = new Set([
  'app/api/admin/maintenance/requeue-sync-jobs/route.ts',
  'app/api/sync/execute/route.ts',
  'app/api/sync-artist/route.ts',
])

/**
 * Routes intentionally public (no admin auth). Document with //@api-public in file
 * or list here for legacy. Prefer annotation for new public admin paths.
 */
const ADMIN_PUBLIC_ALLOWLIST = new Set([
  // GET genres is public catalogue read (portal profile picker)
  'app/api/admin/genres/route.ts',
])

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (entry.name === 'route.ts') acc.push(full)
  }
  return acc
}

function relPath(abs) {
  return relative(root, abs).replaceAll('\\', '/')
}

function hasMethods(content) {
  return /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(content)
    || /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(content)
}

function isPureReexport(content) {
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim()
  if (!withoutComments) return false
  // Only re-export statements (one or more), no local handlers
  const lines = withoutComments.split(/\n/).map((l) => l.trim()).filter(Boolean)
  return lines.every(
    (line) =>
      /^export\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?$/.test(line)
      || /^export\s+\*\s+from\s+['"][^'"]+['"]\s*;?$/.test(line),
  )
}

function hasMutation(content) {
  return /export\s+const\s+(POST|PUT|PATCH|DELETE)\b/.test(content)
    || /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(content)
}

function hasWithErrorHandler(content) {
  // withPartnerAuth composes withErrorHandler internally (partner v1 routes).
  return /withErrorHandler/.test(content) || /withPartnerAuth/.test(content)
}

function hasPortalAuth(content) {
  return (
    /withPortalMembership/.test(content)
    || /authenticatePortalBearer/.test(content)
    || /authenticatePortalBearerWithArtist/.test(content)
    || /authenticateTourPlannerRequest/.test(content)
    || /portalMemberWrite/.test(content)
  )
}

/** Mutations that intentionally skip artist membership pin (user-scoped only). */
const PORTAL_MUTATION_NO_MEMBERSHIP_ALLOWLIST = new Set([
  'app/api/portal/cover-art-check/route.ts',
  'app/api/portal/proxy-image/route.ts',
])

function hasPortalMembershipWrite(content) {
  return (
    /withPortalMembershipWrite|withPortalMembership\b|portalMemberWrite|authenticateTourPlannerRequest/.test(
      content,
    )
  )
}

function hasAdminAuth(content) {
  return (
    /verifyAdmin\b/.test(content)
    || /verifyAdminOrEditor/.test(content)
    || /verifyPermission/.test(content)
    || /verifySyncTrigger/.test(content)
    || /from ['"]@\/lib\/adminAuth['"]/.test(content)
    || (/createServerSupabaseClient/.test(content)
      && (/getUserRole/.test(content) || /resolveEffectiveAccess/.test(content) || /getUser\(/.test(content)))
  )
}

function isApiPublic(content, pathRel) {
  if (ADMIN_PUBLIC_ALLOWLIST.has(pathRel)) return true
  return /@api-public\b/.test(content)
}

function main() {
  const files = walk(apiDir)
  const errors = []
  const warnings = []

  for (const file of files) {
    const pathRel = relPath(file)
    const content = readFileSync(file, 'utf8')

    if (REEXPORT_ALLOWLIST.has(pathRel) || isPureReexport(content)) {
      continue
    }

    if (!hasMethods(content)) {
      warnings.push(`${pathRel}: no exported HTTP methods detected`)
      continue
    }

    if (!hasWithErrorHandler(content)) {
      errors.push(`${pathRel}: missing withErrorHandler`)
    }

    const isPortal = pathRel.startsWith('app/api/portal/')
    const isAdmin = pathRel.startsWith('app/api/admin/')

    if (isPortal && hasMutation(content) && !hasPortalAuth(content)) {
      errors.push(`${pathRel}: portal mutation without recognized portal auth helper`)
    }

    // Artist-scoped mutations must pin membership (allowlist: user-only actions)
    if (
      isPortal
      && hasMutation(content)
      && !PORTAL_MUTATION_NO_MEMBERSHIP_ALLOWLIST.has(pathRel)
      && !hasPortalMembershipWrite(content)
    ) {
      errors.push(
        `${pathRel}: portal mutation should use withPortalMembershipWrite/portalMemberWrite (or add to allowlist)`,
      )
    }

    if (isAdmin && !isApiPublic(content, pathRel) && !hasAdminAuth(content)) {
      // Allow pure public GET-only under admin if annotated; otherwise error
      if (hasMutation(content) || !/@api-public\b/.test(content)) {
        // GET-only admin without auth is suspicious unless public allowlist
        if (hasMutation(content) || !ADMIN_PUBLIC_ALLOWLIST.has(pathRel)) {
          if (!hasAdminAuth(content)) {
            errors.push(`${pathRel}: admin route without recognized admin auth (add auth or //@api-public)`)
          }
        }
      }
    }
  }

  if (warnings.length) {
    console.warn('[verify-api-contracts] warnings:')
    for (const w of warnings) console.warn('  ·', w)
  }

  if (errors.length === 0) {
    console.log(`[verify-api-contracts] OK — ${files.length} route files checked`)
    process.exit(0)
  }

  console.error(`[verify-api-contracts] FAIL — ${errors.length} violation(s):`)
  for (const e of errors) console.error('  •', e)
  process.exit(1)
}

main()
