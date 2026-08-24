# Agent Workflow

Rules for AI agent runs on this project. Session start + mandatory CI live in `AGENTS.md`. Never open a PR with failing checks; no `as any` / `@ts-ignore` / `eslint-disable` to silence errors.

## Local CI (`npm run ci`)

Same gate surface as `.github/workflows/ci.yml`, runnable in three phases:

| Script | What runs |
|--------|-----------|
| `npm run ci:contracts` | lint, scroll/overlay/**mobile-layout**/brand/i18n contracts, portal-rls, schema-columns (incl. **no** `supabase/migrations/*.sql`), api-contracts |
| `npm run ci:typecheck` | `tsc --noEmit` |
| `npm run ci:tests` | vitest + production build |
| `npm run ci` | all three phases in order |

Prefer `npm run ci` before PR. Re-run a single phase when debugging a failure.

## Pull requests

GitHub uses [`.github/pull_request_template.md`](../../.github/pull_request_template.md). Fill the docs checklist **when applicable** (see living docs below) — do not no-op edit docs just to tick boxes. There is **no** CI job that requires “any doc file changed whenever code changes”; quality is enforced by agents following this workflow + review.

## Docs review (end of every session) — **always required**

Agents **must always** update documentation and relevant markdown files at the end of the session (or before every PR), as part of the same deliverable as code. Do not wait for the user to ask. “Code-only” handoffs that leave docs stale are incomplete.

**When:** After the feature/fix is implemented and checks pass; **before** you say the task is done, open a PR, or stop.

**What to do:**

1. Re-read what changed (diff / summary).
2. Update **every** markdown that would otherwise lie or omit the new behavior (table below).
3. Prefer small, accurate edits over large rewrites; do not invent product claims.
4. If nothing product-facing changed, still confirm living docs / agent specs need no touch — and note that briefly.

Review and update stale sections in:

| Area | Files |
|------|-------|
| Agent spec | `AGENTS.md`, `docs/agent/*.md` |
| Onboarding | `README.md`, `DEPLOYMENT.md`, `.env.example`, `scripts/vercel-install.sh` |
| Product state | `PRD.md`, `INTEGRATION-SUMMARY.md`, `ADMIN.md`, `SECURITY.md` |
| Living docs | `CHANGELOG.md`, `LESSONS_LEARNED.md`, `QA_CHECKLIST.md` (see below) |

Mandatory even when the task did not start as a docs task. New public APIs, components, or utilities → update the relevant `docs/agent/*.md` topic file (or JSDoc).

### Living docs (before every PR)

Update when applicable — pure typo/doc-only sessions with no product change may skip CHANGELOG/QA.

| File | When to update |
|------|----------------|
| `CHANGELOG.md` | User-facing features, API/route changes, security fixes, or breaking changes → add bullets under `[Unreleased]`. Skip internal refactors with no observable change. **Do not leave product waves forever under Unreleased** — cut a SemVer section when releasing (see [RELEASING.md](../RELEASING.md)). |
| `LESSONS_LEARNED.md` | Session uncovered a recurring anti-pattern, non-obvious failure mode, or process gap → append a dated entry under `## Session additions`. Promote to rule tables only after the pattern recurs. Skip one-off typos. |
| `QA_CHECKLIST.md` | New/changed user flows, auth guards, consent/i18n/PWA behavior, or E2E-covered features → add or adjust checklist items. Skip internal refactors that don't change testable behavior. |

## App versioning & releases

Product version is SemVer in `package.json` (not `0.0.0`). Annotated tags `vX.Y.Z` + CHANGELOG sections label releases; Vercel still deploys every `main` merge.

| Command | Purpose |
|---------|---------|
| `npm run release:check` | package version has `## [X.Y.Z]` in CHANGELOG; no local tag yet |
| `npm run release -- bump patch\|minor\|major` | bump package + lockfile |
| `npm run release:tag` | create annotated `vX.Y.Z` |

Full ritual, historical tags, and SemVer rules: **[docs/RELEASING.md](../RELEASING.md)**. Runtime identity: `src/lib/appVersion.ts` → full health snapshot `app.version` / `app.commit` (Admin → System).

**Minimal changes:** smallest diff that fully solves the requirement; no unrelated refactors; no new dependencies unless necessary.

## Notifications (human-facing workflows)

If a change creates work for staff or artists (queues, decisions, messages):

1. Add or reuse a type in `src/lib/notifications/catalog.ts`
2. Call `emitNotification(serviceDb, …)` after the successful write (never user JWT)
3. Ensure admin/portal routing + i18n keys exist
4. Cover emit with a unit or route test

See [frontend.md](./frontend.md) and [backend.md](./backend.md).

## Multi-agent pattern (large tasks)

For tasks with >3 distinct concerns:

1. List sub-tasks in the PR description.
2. One atomic commit per sub-task.
3. Run full CI after each commit.

Prefer separate GitHub Issues per independent module (schema → DAL → UI). Mark blocking deps explicitly. Handoff comments must list exports and schema changes for dependent agents.

## Living spec

New conventions → update the matching `docs/agent/*.md` file. New topic → add file and link from `AGENTS.md`.

**Session closeout (non-negotiable):** code complete → mandatory checks → **docs/markdown update** → only then commit/PR or report done.