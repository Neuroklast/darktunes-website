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

## Critical rules (always apply)

- **Schema:** Only `supabase/reset.sql` + `src/types/database.ts` — no `supabase/migrations/`
- **Artist nav:** Roster cards MUST link to `/artists/[slug]`, never open modals
- **`unstable_cache`:** Cookie-free Supabase anon client inside callbacks (never `cookies()`)
- **DAL:** Queries in `src/lib/api/`; pass `SupabaseClient` as first argument
- **Route handlers:** `withErrorHandler`; admin routes use `src/lib/adminAuth.ts`
- **WCAG 2.1 AA** on all public UI
- **Minimal changes:** Smallest diff that fully solves the task

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
| Portal, press, EPK, PWA, newsletter | [features.md](docs/agent/features.md) |

After introducing new patterns, update the relevant `docs/agent/*.md` file.

## External docs

[README.md](README.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [ADMIN.md](ADMIN.md) · [SECURITY.md](SECURITY.md) · [supabase/DB_REQUIREMENTS.md](supabase/DB_REQUIREMENTS.md)