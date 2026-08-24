/**
 * App product version (SemVer) + deploy identity (git commit).
 *
 * SSOT for the product version is package.json (bumped on release).
 * Commit SHA is read from host env only — never shell out to git at runtime.
 *
 * @see docs/RELEASING.md
 */

import packageJson from '../../package.json'

export interface AppVersionInfo {
  /** Semantic version from package.json (e.g. "1.6.0"). */
  version: string
  /** Short commit SHA (7–12 chars) when available. */
  commit: string | null
  /** Full commit SHA when available. */
  commitFull: string | null
}

function normalizeSha(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!/^[0-9a-f]{7,40}$/i.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/** Env bag for commit resolution (tests pass partial objects). */
export type CommitEnv = Record<string, string | undefined>

/**
 * Resolve git commit from deploy/CI environment.
 * Order: Vercel → GitHub Actions → optional NEXT_PUBLIC override.
 */
export function resolveCommitSha(
  env: CommitEnv = process.env,
): { full: string | null; short: string | null } {
  const full = normalizeSha(
    env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? env.NEXT_PUBLIC_GIT_COMMIT,
  )
  if (!full) return { full: null, short: null }
  return { full, short: full.slice(0, 7) }
}

/** Product version string from package.json. */
export function getAppVersion(): string {
  return typeof packageJson.version === 'string' && packageJson.version.length > 0
    ? packageJson.version
    : '0.0.0'
}

/** Version + commit for health UI, support, and ops. */
export function getAppVersionInfo(env: CommitEnv = process.env): AppVersionInfo {
  const { full, short } = resolveCommitSha(env)
  return {
    version: getAppVersion(),
    commit: short,
    commitFull: full,
  }
}

/** Compact display label: `v1.6.0 · abc1234` or `v1.6.0` when commit unknown. */
export function formatAppVersionLabel(info: AppVersionInfo = getAppVersionInfo()): string {
  return info.commit ? `v${info.version} · ${info.commit}` : `v${info.version}`
}
