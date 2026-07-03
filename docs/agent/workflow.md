# Agent Workflow

Rules for AI agent runs on this project. Mandatory CI sequence lives in `AGENTS.md` — run all four checks after every change; never open a PR with failures; no `as any` / `@ts-ignore` / `eslint-disable` to silence errors.

## Docs review (end of every session)

Review and update stale sections in:

| Area | Files |
|------|-------|
| Agent spec | `AGENTS.md`, `docs/agent/*.md` |
| Onboarding | `README.md`, `DEPLOYMENT.md`, `.env.example`, `scripts/vercel-install.sh` |
| Product state | `INTEGRATION-SUMMARY.md`, `ADMIN.md`, `SECURITY.md` |
| Living docs | `CHANGELOG.md`, `LESSONS_LEARNED.md`, `QA_CHECKLIST.md` (see below) |

Mandatory even when the task did not touch docs. New public APIs, components, or utilities → update the relevant `docs/agent/*.md` topic file (or JSDoc).

### Living docs (before every PR)

Update when applicable — skip doc-only sessions with no product change.

| File | When to update |
|------|----------------|
| `CHANGELOG.md` | User-facing features, API/route changes, security fixes, or breaking changes → add bullets under `[Unreleased]`. Skip internal refactors with no observable change. |
| `LESSONS_LEARNED.md` | Session uncovered a recurring anti-pattern, non-obvious failure mode, or process gap → append a dated entry under `## Session additions`. Promote to rule tables only after the pattern recurs. Skip one-off typos. |
| `QA_CHECKLIST.md` | New/changed user flows, auth guards, consent/i18n/PWA behavior, or E2E-covered features → add or adjust checklist items. Skip internal refactors that don't change testable behavior. |

**Minimal changes:** smallest diff that fully solves the requirement; no unrelated refactors; no new dependencies unless necessary.

## Multi-agent pattern (large tasks)

For tasks with >3 distinct concerns:

1. List sub-tasks in the PR description.
2. One atomic commit per sub-task.
3. Run full CI after each commit.

Prefer separate GitHub Issues per independent module (schema → DAL → UI). Mark blocking deps explicitly. Handoff comments must list exports and schema changes for dependent agents.

## Living spec

New conventions → update the matching `docs/agent/*.md` file. New topic → add file and link from `AGENTS.md`.