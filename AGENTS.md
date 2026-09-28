# darkTunes Music Group — Agent Guidelines

Next.js 15 label website: public site, admin CMS, artist portal, and press/journalist dashboard.
Stack: React 19, Supabase (PostgreSQL), Cloudflare R2, Vercel.

**Package manager:** npm only (`npm ci` in CI).

## Session start (read before coding)

1. **This file** — critical rules, checks, and docs closeout.
2. **Topic file** — open the matching `docs/agent/{topic}.md` from the table below for the area you touch.
3. **PRD.md** — only when the task is product/feature-shaped (not pure refactors/CI).
4. **End of session** — docs refresh is mandatory; follow [workflow.md](docs/agent/workflow.md).

Skipping specs and fixing CI later costs more than reading first.

## Mandatory checks (every code change)

Prefer the full local pipeline (same gates as GitHub CI):

```bash
npm run ci
```

Or by phase when debugging a failure:

1. `npm run ci:contracts` — lint + scroll/overlay/brand/i18n + portal-rls + schema-columns + api-contracts
2. `npm run ci:typecheck` — `tsc --noEmit`
3. `npm run ci:tests` — unit tests + production build

Lighthouse/Performance workflows (`lighthouse-ci.yml`, `performance-budget.yml`, `performance-tests.yml`) run **only on explicit `workflow_dispatch`** — never automatically on PRs, pushes or a schedule.

No PR with failing checks. No `as any`, `@ts-ignore`, or `eslint-disable` to silence errors.

## Mandatory docs update (end of every agent session)

**Always** refresh documentation and markdown before you declare work done, open a PR, or hand off — not only when the user asks. Treat docs as part of the deliverable, same as code.

1. Update every **stale** markdown that describes what you changed (agent specs, product docs, living docs).
2. Run the full end-of-session review in [workflow.md](docs/agent/workflow.md) (checklist of files).
3. When product behavior changed: [CHANGELOG.md](CHANGELOG.md), [QA_CHECKLIST.md](QA_CHECKLIST.md); when a reusable lesson appeared: [LESSONS_LEARNED.md](LESSONS_LEARNED.md).
4. New/changed patterns → matching `docs/agent/*.md`. Public surface / ops → `README.md`, `ADMIN.md`, `DEPLOYMENT.md`, `SECURITY.md` as applicable.

Skipping docs because “the task was only code” is a process failure.

## E2E tests are forbidden (disabled)

Playwright / E2E (`tests/e2e/*`, `npm run test:e2e`, `npm run db:e2e:*`) is **forbidden** in this repository: the stack hangs and must not gate any work.

- **Do not add, update, run, or require E2E specs** — not in PRs, not in CI, not as a release gate.
- **Do not re-enable** the removed `qa.yml` / `e2e-comment.yml` workflows or wire Playwright into any pipeline.
- Coverage is provided by Vitest unit/route tests (`npm run test`) and `npm run ci` (contracts → typecheck → tests → build). If a change needs user-flow evidence, cover the logic in a unit/route test and document manual QA in `QA_CHECKLIST.md`.

## Critical rules (always apply)

- **Schema:** Only `supabase/reset.sql` + `src/types/database.ts` — no `supabase/migrations/`
- **Artist nav:** Roster cards MUST link to `/artists/[slug]`, never open modals
- **`unstable_cache`:** Cookie-free Supabase anon client inside callbacks (never `cookies()`)
- **DAL:** Queries in `src/lib/api/`; pass `SupabaseClient` as first argument
- **Route handlers:** `withErrorHandler`; admin routes use `src/lib/adminAuth.ts`
- **OpenAPI:** Every API endpoint you create or change MUST ship an accompanying OpenAPI `.yaml` spec — an endpoint is not done until its paths, request/response schemas, and status codes are reflected in the spec
- **REST guidelines (MANDATORY, NO EXCEPTIONS):** Every API endpoint and its OpenAPI spec MUST comply with the REST guidelines in [`skills/rest-guidelines/SKILL.md`](skills/rest-guidelines/SKILL.md) — a self-contained, offline, LLM/tool-agnostic subset of the Zalando RESTful API Guidelines. This is non-negotiable — resource naming (kebab-case paths, plural nouns), HTTP methods/status codes, `problem+json` error bodies, pagination, snake_case JSON properties, versioning, and required headers all follow that standard. Reconcile any existing endpoint that violates it when you touch it
- **WCAG 2.1 AA** on all public UI
- **Minimal changes:** Smallest diff that fully solves the task
- **Docs:** Always update documentation/markdown at session end (see above)
- **E2E:** Forbidden — do not add, run, or require Playwright/E2E tests (see “E2E tests are forbidden”); cover logic with Vitest unit/route tests
- **Bronze CSV (SOS):** Direct browser → R2 presigned upload/download is the supported route (single PUT ≤ 100 MB, multipart 64 MB parts, non-final parts ≥ 5 MiB; requires R2 bucket CORS — see `DEPLOYMENT.md`). Register/confirm/presign go through `/api/admin/sos/import-batches/*`; the server proxy is single-request only (≤ 4 MB) and must never chunk multipart; limits in `src/lib/sos/bronzeUploadLimits.ts`
- **Cron jobs = plain HTTPS, managed in the Supabase UI:** Every scheduled HTTP job is a direct `net.http_post` to `https://www.darktunes.com/...` (always `www` — the apex 308-redirects and pg_net/curl drops the `Authorization` header on the cross-host redirect → 401) with the `Authorization: Bearer <CRON_SECRET>` header in the request itself. **Never** wrap a cron call in a SQL/plpgsql function (no `trigger_*()` wrappers, no Vault `site_url`/`cron_secret` indirection — they failed silently in production). **Never** create, schedule, unschedule or trigger cron jobs via SQL or `supabase/reset.sql`; jobs are created and edited only in the Supabase dashboard (Integrations → Cron)
- **No infra ops in admin UI:** Label admin must not show R2 / Vercel / Supabase Cron / Edge Function / `CRON_SECRET` setup. Product health + Force Sync only; scheduler docs in `DEPLOYMENT.md`

## Scroll — decision tree (read before touching any layout)

1. **Public route** (`/`, `/artists`, `/news`, …) → Lenis owns scroll. Do NOT add `overflow-y-auto` to page-level wrappers. Scrollable panels within the page → `<ScrollPanel>` (`src/components/ui/scroll-panel.tsx`).
2. **Dashboard route** (`/admin/*`, `/portal/*`, `/editor/*`) → Native scroll via `ScrollableAppShell`. Never add `min-h-screen` or a root `overflow-y-auto` on content pages.
3. **New admin CRUD list** → `AdminPageShell layout="list"` + `AdminListShell`. Register route in `src/lib/scroll/dashboardRoutes.ts` (`isAdminListRoute`).
4. **Full-bleed tool page** (e.g. file explorer) → `AdminPageShell fill`.
5. **Wide table** → `horizontalScrollClass` from `scroll-panel.tsx`. Never `overflow-x-auto overscroll-contain` without `overflow-y-clip`.
6. **Swiper / carousel:** Do **not** blanket `data-lenis-prevent` on the whole widget (kills buttery Lenis). Keep vertical wheel on Lenis; horizontal drag / axis-aware wheel for slides (`touch-action: pan-y`, optional horizontal `onWheel`).
7. **Modal body / real nested vertical scrollports** → `overflow-y-auto max-h-[70vh]` + `data-lenis-prevent`. Never use prevent for “this component is heavy” — use scroll VFX budget (`html[data-scrolling]`) instead.
8. **After any scroll change** → run `npm run check:scroll` locally before pushing.
9. **Multi-column builders (EPK / fan-page):** Never hide `ResizablePanelGroup` with CSS alone — mount only when `useIsLg()`. After changes run `npm run check:mobile-layout`.

## Detailed guidelines

Read the relevant file before working in that area:

| Topic | File |
|-------|------|
| CI loop, docs maintenance, multi-agent | [workflow.md](docs/agent/workflow.md) |
| RSC/client, IoC, CQRS, naming, caching | [architecture.md](docs/agent/architecture.md) |
| DAL, SSOT, ISR tags, R2 keys, DB schema | [data-and-schema.md](docs/agent/data-and-schema.md) |
| Tailwind v4, a11y, modals, theme, Lenis | [frontend.md](docs/agent/frontend.md) |
| Vitest, Playwright, perf budgets | [testing-performance.md](docs/agent/testing-performance.md) |
| Admin auth, sync, cron, assets, health | [backend.md](docs/agent/backend.md) |
| Portal write auth (JWT vs service role) | [portal-write-auth.md](docs/agent/portal-write-auth.md) |
| Portal (analytics split, feedback, Bandsintown, press, EPK, PWA) | [features.md](docs/agent/features.md) |
| Legacy / hardcode / security residual inventory | [debt-inventory.md](docs/agent/debt-inventory.md) |

After introducing new patterns, update the relevant `docs/agent/*.md` file.

**Before finishing any session or opening a PR:** complete the mandatory docs update above and the end-of-session review in [workflow.md](docs/agent/workflow.md) — including [CHANGELOG.md](CHANGELOG.md), [LESSONS_LEARNED.md](LESSONS_LEARNED.md), and [QA_CHECKLIST.md](QA_CHECKLIST.md) when the session changed product behavior.

## External docs

[PRD.md](PRD.md) · [README.md](README.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [docs/RELEASING.md](docs/RELEASING.md) · [ADMIN.md](ADMIN.md) · [SECURITY.md](SECURITY.md) · [INTEGRATION-SUMMARY.md](INTEGRATION-SUMMARY.md) · [CHANGELOG.md](CHANGELOG.md) · [LESSONS_LEARNED.md](LESSONS_LEARNED.md) · [QA_CHECKLIST.md](QA_CHECKLIST.md) · [supabase/DB_REQUIREMENTS.md](supabase/DB_REQUIREMENTS.md)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
