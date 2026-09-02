# Product Requirements — darkTunes Music Group Website

Living product requirements for the multi-surface label platform.  
**Stack (SSOT):** Next.js 15 App Router · React 19 · Supabase (PostgreSQL) · Cloudflare R2 · Vercel · Tailwind v4.  
**Schema SSOT:** `supabase/reset.sql` + `src/types/database.ts` only (no `supabase/migrations/`).

Related docs: [README.md](README.md) · [ADMIN.md](ADMIN.md) · [INTEGRATION-SUMMARY.md](INTEGRATION-SUMMARY.md) · [docs/agent/](docs/agent/) · [CHANGELOG.md](CHANGELOG.md)

---

## 1. Product vision

A modern alternative music label platform that combines:

1. **Public brand site** — immersive dark/CRT aesthetic, roster, releases, news, videos, events, legal, newsletter.
2. **Artist portal** — multi-tenant workspace for roster acts (analytics, settlements, submissions, production tools).
3. **Admin / editor CMS** — content, finance (SOS), users, system health, review queues.
4. **Press / journalist surfaces** — applications, accreditation, promo pool, EPK/press kits.

**Experience qualities:** immersive · dynamic (Lenis on public) · bold high-contrast branding · WCAG 2.1 AA on public UI.

---

## 2. Surfaces & primary users

| Surface | Route prefix | Primary users | Auth |
|---------|--------------|---------------|------|
| Public site | `/`, `/artists`, `/releases`, `/news`, … | Fans, industry, SEO | None (consent for tracking) |
| Central login | `/login` | All roles | Supabase Auth |
| Artist portal | `/portal/*` | Artists / band members | Session + `artist_members` tenancy |
| Admin | `/admin/*` | Label admins | Admin role (+ permissions) |
| Editor CMS | `/editor` | Editors | Editor role |
| Press public | `/press/*` | Journalists / public | Mixed |
| Press dashboard | `/press/dashboard/*` | Accredited journalists | Journalist role + accreditation |
| Promo pool | `/promo-pool` | Journalists | Dual-gate |
| Shared tour | `/tour/share/[token]` | External collaborators | Token |

---

## 3. Essential capabilities

### 3.1 Public website

- Hero (featured content), releases, artists roster, news, videos, concerts/events, Spotify multi-player section, newsletter (DOI), legal (`/impressum`, `/datenschutz`, `/agb`).
- ISR + `generateStaticParams` on key detail routes; loading skeletons for CLS.
- i18n EN/DE (dictionary + Accept-Language / switcher).
- CRT/theme overlays configurable from admin color theme.
- Consent-gated page analytics (`page_events`).

### 3.2 Artist portal (`/portal`)

| Module | Purpose | Notes |
|--------|---------|--------|
| Dashboard / intelligence | Overview KPIs, shortcuts | Feature-flag aware nav |
| Profile | Roster bio, photos, links | Membership-scoped writes |
| Analytics | 11 tabs + Spotify presence | SOS streams ≠ public presence; disclaimer required |
| Statements | SOS PDFs, provenance, source CSV | Chain of custody |
| Billing + invoices | Tax status, SEPA, §14 UStG PDF | VIES for reverse charge; write-once PDF |
| Releases / videos | Guided submission wizards | Cover art verify, drafts, idempotency |
| Tour / tour-planner | Events vs TRACK production | Optional feature flag |
| Fan page + EPK builder | Landing + press kit canvas | Review/publish gates |
| Marketing, documents, calendar | Promo assets, vault, release calendar | R2 vault keys |
| Messages | Label ↔ artist mailbox | Shared inbox on admin |
| Interviews | Journalist interview requests | Status + reply |
| Onboarding | First-run + AGB opt-in | Version gate |
| Help / FAQ | CMS FAQ + help manifest | `/portal/help` |
| **Feedback** | Product feedback form + history | `/portal/feedback` → admin inbox |
| Settings | Password / account | Strong password policy |

**Tenancy:** `?artistId=` + `resolvePortalArtist` / `artist_members`. Never trust body-only artist ids for authz.

### 3.3 Admin (`/admin`)

- CMS: artists, releases, news, videos, events, genres, assets (R2 explorer), colors, settings, features, portal FAQ.
- Queues: release submissions, video submissions, fan page reviews, **artist feedback**, accreditations.
- Finance: accounting (guided SOS + Abrechnungszentrale + bronze CSV), statements, settlements, invoices.
- Comms: messages (shared inbox), notifications, promo log.
- Users / roles / custom roles / API credentials (encrypted).
- System: health, sync control plane, logs, maintenance, support (Zammad).
- Analytics: Label Intelligence hub.

### 3.4 Press & promo

- Journalist apply → accreditation → dashboard (press kit, promo pool, interviews, profile).
- Press-only news excluded from public feeds.
- Secure downloads via server/presigned patterns (never long-lived public secrets).

### 3.5 Platform services

- Sync queue: iTunes, Spotify, Discogs, Odesli, YouTube, Songkick/Bandsintown; Apify public play scrapes (budgeted).
- R2 object keys SSOT (see `docs/agent/data-and-schema.md`).
- Errors: `withErrorHandler` + `ApiError` on route handlers.
- Notifications: `emitNotification` catalog after successful writes.

---

## 4. Non-functional requirements

| Area | Requirement |
|------|-------------|
| A11y | WCAG 2.1 AA on public UI; 44px targets; focus visible |
| Scroll | Public = Lenis; dashboards = native shell (`docs/agent` scroll tree) |
| Security | RLS on sensitive tables; admin dual-auth; portal membership gates; no service-role in browser |
| Performance | Core Web Vitals budgets; ISR; no unnecessary client data fetches on public RSC pages |
| i18n | User-facing EN/DE; no raw toast English hardcoding for new features |
| Schema | Idempotent `reset.sql` only; types in `database.ts` |
| Brand | No hardcoded tenant names in app code (`check:brand`) |
| Bronze CSV | Never browser→presigned R2 for SOS imports |

---

## 5. Success criteria (product)

- Public site loads without auth; content CMS-driven and cache-invalidated after writes.
- Artists complete billing → invoice from statement without label hand-holding (guided paths).
- Admins process submissions/feedback/messages with clear queues and badges.
- Settlement ledger invariants hold (no double-booking; approve idempotent).
- Public Spotify metrics never mixed into SOS payout totals.
- Feedback is product UX signal only — not a substitute for Zammad technical support.

---

## 6. Out of scope (current)

- Full ticketing / artist↔admin reply thread on product feedback.
- Third-party IBAN lookup APIs (explicitly forbidden).
- Browser direct upload to SOS bronze R2.
- Global state libraries (Redux etc.) — RSC + local state preferred.

---

## 7. Design direction (public)

Gritty underground alternative aesthetic: near-black backgrounds, purple accents, Oxanium / Roboto Slab / JetBrains Mono hierarchy, CRT scanlines as brand texture (never harm readability). Spring-based motion; reduced-motion respected.

Admin/portal use denser dashboard chrome (`ScrollableAppShell`), not public Lenis immersion.

---

## 8. Edge cases

| Case | Behavior |
|------|----------|
| Empty roster/content | Placeholders / hide empty sections |
| Multi-artist user | Artist switcher; all data scoped to active `artistId` |
| Offline portal | Limited routes (tour-planner, help, dashboard) via offline flags |
| Locked settlement period | Block new statement-linked invoices (422) |
| Missing FX rates | Gate SOS processing until rates available |
| Rate limits | Uploads, feedback, invites, messages return 429 with clear copy |

---

## 9. Traceability

| Requirement area | Implementation anchors |
|------------------|------------------------|
| Portal modules | `app/portal/*`, `docs/agent/features.md` |
| Admin CMS | `app/admin/*`, `ADMIN.md` |
| Schema / DAL | `supabase/reset.sql`, `src/lib/api/*` |
| Auth patterns | `docs/agent/portal-write-auth.md`, `src/lib/adminAuth.ts` |
| QA | `QA_CHECKLIST.md` |
| History | `CHANGELOG.md` `[Unreleased]` + version tags |
