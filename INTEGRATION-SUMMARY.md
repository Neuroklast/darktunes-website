# Integration Summary — darkTunes Music Group

Living product-status snapshot. Architecture and agent rules: `AGENTS.md` + `docs/agent/`. User guides: `README.md`, `ADMIN.md`, `DEPLOYMENT.md`.

**Stack:** Next.js 15 · React 19 · Supabase · Cloudflare R2 · Vercel · Tailwind v4  
**Schema:** `supabase/reset.sql` only (no migrations) · **PRD:** [PRD.md](PRD.md)

---

## Public website

| Area | Status |
| ------ | -------- |
| Home (hero, releases, artists, videos, news, tour, player) | ✅ RSC + ISR 60s, WCAG AA |
| Artist / release / news detail pages | ✅ ISR + `generateStaticParams` |
| i18n (EN/DE) | ✅ Dictionary prop injection |
| Legal, consent, newsletter DOI | ✅ |
| PWA (Serwist) | ✅ |
| Page tracking | ✅ Consent-gated `page_events` |

## Admin (`/admin`)

| Area | Status |
| ------ | -------- |
| CMS (artists, releases, news, videos, assets, events) | ✅ |
| Messages, promo log, submissions, artist feedback, accreditations | ✅ |
| Users, roles, feature flags, API keys | ✅ |
| **Accounting** | ✅ Guided workflow (Upload → Review → Publish), Abrechnungszentrale, bronze CSV server-proxy, Save to Portal |
| Label analytics hub | ✅ |
| System (health, logs, maintenance) | ✅ |
| Press kit curation | ✅ `assets` + `press_kit_items` |

## Artist portal (`/portal`)

| Area | Status |
| ------ | -------- |
| Profile, EPK (legacy + canvas builder), onboarding | ✅ |
| Analytics (11 tabs + intelligence) | ✅ |
| Statements, billing, invoices | ✅ SOS-linked + free PDF generator |
| **Inline billing** | ✅ `InlineBillingProfileStep` on invoices, analytics earnings, statements |
| Releases, tour, calendar, marketing, documents | ✅ |
| Messages, interviews, help, settings | ✅ |
| **Product feedback** | ✅ `/portal/feedback` form + history; admin `/admin/feedback` inbox |
| Multi-tenant RLS + `portal_feature_flags` | ✅ |

## Press & journalist

| Area | Status |
| ------ | -------- |
| Public press + artist EPK pages | ✅ |
| Journalist dashboard + promo pool | ✅ Dual-gate auth |
| Applications + accreditation | ✅ DB trigger on approve |
| Secure downloads + logging | ✅ Presigned URLs only on click |

## Platform services

| Area | Key paths |
| ------ | ----------- |
| DAL | `src/lib/api/*` — `SupabaseClient` first arg |
| Sync | `src/lib/sync/` — iTunes, Spotify, Discogs, Songkick, Bandsintown, Odesli; `sync_queue` + cron |
| Upload | `app/api/upload` (admin), portal upload routes |
| SOS PDF | `uploadStatement` Server Action |
| Settlement | `settlementPeriods`, `settlementLedger`, `settlementRegister`, `useSettlementCenter` |
| Errors | `withErrorHandler`, `ApiError` |
| Images | `imageUtils.ts` (wsrv.nl), `r2Utils.ts` |
| Health | `GET /api/health`, `/admin/system` |

---

## Entry-point files

| File | Purpose |
| ------ | --------- |
| `PRD.md` | Product requirements (surfaces, modules, NFRs) |
| `README.md` | Quick start, scripts, env overview |
| `DEPLOYMENT.md` | Vercel, Supabase, R2 setup |
| `ADMIN.md` | Admin + portal operator guide |
| `AGENTS.md` | Agent index + mandatory checks |
| `docs/agent/*.md` | Topic-specific coding rules |
| `supabase/reset.sql` | Canonical DB schema |
| `src/types/database.ts` | TypeScript DB types (sync with reset.sql) |
| `.env.example` | Env var template |

## Dead code cleanup

**2026-08-05:** High-confidence orphans removed in `chore/dead-code-cleanup` (legacy login shells, unused mailbox/charts, fixtures, unused image worker, orphaned `publicContentMaintenance` chain — scheduled news/hero/emoji maintenance is documented as Supabase Cron / Edge, not the Next read path).

Still keep without bulk-delete: `app/sw.ts`, `scripts/*`, `supabase/functions/*`, unused shadcn primitive exports, env-gated `replica.ts`.

## Quick start

```bash
cp .env.example .env.local   # fill Supabase + R2 vars
npm ci && npm run dev
# http://localhost:3000 · /admin · /portal
```
