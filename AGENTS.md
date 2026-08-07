# darkTunes Music Group — Agent Guidelines

Next.js 15 label website: public site, admin CMS, artist portal, and press/journalist dashboard.
Stack: React 19, Supabase (PostgreSQL), Cloudflare R2, Vercel.

**Package manager:** npm only (`npm ci` in CI).

## Mandatory checks (every code change)

Run in order until all pass:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm test`
4. `npm run build`

No PR with failing checks. No `as any`, `@ts-ignore`, or `eslint-disable` to silence errors.

## Mandatory docs update (end of every agent session)

**Always** refresh documentation and markdown before you declare work done, open a PR, or hand off — not only when the user asks. Treat docs as part of the deliverable, same as code.

1. Update every **stale** markdown that describes what you changed (agent specs, product docs, living docs).
2. Run the full end-of-session review in [workflow.md](docs/agent/workflow.md) (checklist of files).
3. When product behavior changed: [CHANGELOG.md](CHANGELOG.md), [QA_CHECKLIST.md](QA_CHECKLIST.md); when a reusable lesson appeared: [LESSONS_LEARNED.md](LESSONS_LEARNED.md).
4. New/changed patterns → matching `docs/agent/*.md`. Public surface / ops → `README.md`, `ADMIN.md`, `DEPLOYMENT.md`, `SECURITY.md` as applicable.

Skipping docs because “the task was only code” is a process failure.

## Critical rules (always apply)

- **Schema:** Only `supabase/reset.sql` + `src/types/database.ts` — no `supabase/migrations/`
- **Artist nav:** Roster cards MUST link to `/artists/[slug]`, never open modals
- **`unstable_cache`:** Cookie-free Supabase anon client inside callbacks (never `cookies()`)
- **DAL:** Queries in `src/lib/api/`; pass `SupabaseClient` as first argument
- **Route handlers:** `withErrorHandler`; admin routes use `src/lib/adminAuth.ts`
- **WCAG 2.1 AA** on all public UI
- **Minimal changes:** Smallest diff that fully solves the task
- **Docs:** Always update documentation/markdown at session end (see above)
- **Bronze CSV (SOS):** Never browser `fetch()` to presigned R2 URLs — use `/api/admin/sos/import-batches/*` routes; limits in `src/lib/sos/bronzeUploadLimits.ts`

## Scroll — decision tree (read before touching any layout)

1. **Public route** (`/`, `/artists`, `/news`, …) → Lenis owns scroll. Do NOT add `overflow-y-auto` to page-level wrappers. Scrollable panels within the page → `<ScrollPanel>` (`src/components/ui/scroll-panel.tsx`).
2. **Dashboard route** (`/admin/*`, `/portal/*`, `/editor/*`) → Native scroll via `ScrollableAppShell`. Never add `min-h-screen` or a root `overflow-y-auto` on content pages.
3. **New admin CRUD list** → `AdminPageShell layout="list"` + `AdminListShell`. Register route in `src/lib/scroll/dashboardRoutes.ts` (`isAdminListRoute`).
4. **Full-bleed tool page** (e.g. file explorer) → `AdminPageShell fill`.
5. **Wide table** → `horizontalScrollClass` from `scroll-panel.tsx`. Never `overflow-x-auto overscroll-contain` without `overflow-y-clip`.
6. **Swiper / carousel / any 3rd-party scroll widget** → wrap with `data-lenis-prevent`.
7. **Modal body** → `overflow-y-auto max-h-[70vh]` + `data-lenis-prevent`.
8. **After any scroll change** → run `npm run check:scroll` locally before pushing.

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

[PRD.md](PRD.md) · [README.md](README.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [ADMIN.md](ADMIN.md) · [SECURITY.md](SECURITY.md) · [INTEGRATION-SUMMARY.md](INTEGRATION-SUMMARY.md) · [CHANGELOG.md](CHANGELOG.md) · [LESSONS_LEARNED.md](LESSONS_LEARNED.md) · [QA_CHECKLIST.md](QA_CHECKLIST.md) · [supabase/DB_REQUIREMENTS.md](supabase/DB_REQUIREMENTS.md)
