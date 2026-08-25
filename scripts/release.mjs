#!/usr/bin/env node
/**
 * App SemVer helpers for darkTunes.
 *
 * Usage:
 *   node scripts/release.mjs check
 *   node scripts/release.mjs bump <major|minor|patch>
 *   node scripts/release.mjs tag [--allow-dirty]
 *
 * Ritual: cut CHANGELOG → bump → CI green → tag → git push origin vX.Y.Z
 * @see docs/RELEASING.md
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(root, 'package.json')
const lockPath = join(root, 'package-lock.json')
const changelogPath = join(root, 'CHANGELOG.md')

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function getPackageVersion() {
  const pkg = readJson(packagePath)
  if (typeof pkg.version !== 'string' || !SEMVER_RE.test(pkg.version)) {
    throw new Error(`Invalid package.json version: ${pkg.version}`)
  }
  return pkg.version
}

function changelogHasVersion(version) {
  const text = readFileSync(changelogPath, 'utf8')
  const re = new RegExp(
    `^## \\[${version.replace(/\./g, '\\.')}\\]`,
    'm',
  )
  return re.test(text)
}

function localTagExists(tag) {
  try {
    execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
      cwd: root,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

function isGitDirty() {
  const out = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  })
  return out.trim().length > 0
}

function parseSemver(version) {
  const m = SEMVER_RE.exec(version)
  if (!m) throw new Error(`Not semver: ${version}`)
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

function bumpVersion(version, kind) {
  const { major, minor, patch } = parseSemver(version)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Unknown bump kind: ${kind} (use major|minor|patch)`)
}

function setPackageVersion(next) {
  const pkg = readJson(packagePath)
  pkg.version = next
  writeJson(packagePath, pkg)

  const lock = readJson(lockPath)
  lock.version = next
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = next
  }
  writeJson(lockPath, lock)
}

function cmdCheck() {
  const version = getPackageVersion()
  const tag = `v${version}`
  const issues = []

  if (!changelogHasVersion(version)) {
    issues.push(`CHANGELOG.md missing section ## [${version}]`)
  }
  if (localTagExists(tag)) {
    issues.push(`Local tag already exists: ${tag}`)
  }

  if (issues.length > 0) {
    console.error(`release:check failed for ${version}:`)
    for (const issue of issues) console.error(`  - ${issue}`)
    process.exit(1)
  }

  console.log(`release:check OK — package ${version}, CHANGELOG section present, no local ${tag}`)
}

function cmdBump(kind) {
  if (!kind || !['major', 'minor', 'patch'].includes(kind)) {
    console.error('Usage: node scripts/release.mjs bump <major|minor|patch>')
    process.exit(1)
  }
  const current = getPackageVersion()
  const next = bumpVersion(current, kind)
  setPackageVersion(next)
  console.log(`Bumped package.json + package-lock.json: ${current} → ${next}`)
  console.log('')
  console.log('Next steps:')
  console.log(`  1. Move CHANGELOG [Unreleased] bullets under ## [${next}] — ${new Date().toISOString().slice(0, 10)}`)
  console.log('  2. npm run release:check')
  console.log('  3. Commit the version bump + changelog')
  console.log('  4. npm run release:tag')
  console.log(`  5. git push origin HEAD && git push origin v${next}`)
}

function cmdTag(args) {
  const allowDirty = args.includes('--allow-dirty')
  const version = getPackageVersion()
  const tag = `v${version}`

  if (!changelogHasVersion(version)) {
    console.error(`CHANGELOG.md missing ## [${version}] — cut the release notes first.`)
    process.exit(1)
  }
  if (localTagExists(tag)) {
    console.error(`Tag ${tag} already exists locally.`)
    process.exit(1)
  }
  if (!allowDirty && isGitDirty()) {
    console.error('Working tree is dirty. Commit first, or pass --allow-dirty.')
    process.exit(1)
  }

  const message = `v${version}`
  execFileSync('git', ['tag', '-a', tag, '-m', message], { cwd: root, stdio: 'inherit' })
  console.log(`Created annotated tag ${tag}`)
  console.log(`Push with: git push origin ${tag}`)
}

function usage() {
  console.log(`Usage:
  node scripts/release.mjs check
  node scripts/release.mjs bump <major|minor|patch>
  node scripts/release.mjs tag [--allow-dirty]
`)
}

const [command, ...rest] = process.argv.slice(2)

try {
  if (command === 'check') cmdCheck()
  else if (command === 'bump') cmdBump(rest[0])
  else if (command === 'tag') cmdTag(rest)
  else {
    usage()
    process.exit(command ? 1 : 0)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
