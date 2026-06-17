# darkTunes Music Group — Website

Official website for **darkTunes Music Group**, an alternative music label.  
Built with **Next.js 15 (App Router)**, React, Supabase, Cloudflare R2, and Tailwind CSS v4.

---

## 🎵 Features

- **Public site** – Hero, Releases (iTunes sync), Artists, Videos, News, Tour dates, Spotify Player
- **Artist Portal** – Secure multi-tenant dashboard at `/portal` for signed-in artists (responsive mobile sidebar, EPK editor + PDF print view, streaming analytics, release submission + checklist, video submission, tour manager, marketing assets, document vault, label inbox with rich-text replies + realtime updates, billing profile management, SOS statement downloads, SOS-linked invoice creation, interview requests, onboarding wizard, calendar, help FAQ, account settings)
- **Internationalisation (i18n)** – EN/DE support via custom dictionary pattern (`src/i18n/`), locale auto-detected from `Accept-Language` header, locale switcher in Header
- **CRT scanline aesthetic** – immersive dark atmosphere with animated overlays
- **Smooth scrolling** – powered by Lenis
- **Admin panel** – full CMS at `/admin` (sidebar navigation with dedicated pages for artists, releases, news, videos, assets, events, messages, accreditations, promo log, release submissions, video submissions, accounting/SOS generator, system/health/logs, color theme, features, settings, users)
- **Artist Auto-Sync** – "Sync Now" per artist triggers multi-API release import (iTunes, Spotify, Discogs, Odesli), R2 cover art caching, and Supabase upsert via async sync queue (`sync_queue` table, processed every 5 min by Vercel cron)
- **YouTube Sync** – `POST /api/sync-youtube` upserts latest channel videos and links them to visible artists by title match; Vercel cron can trigger daily sync
- **Image proxy** – all images served via wsrv.nl (WebP conversion, on-the-fly resize)
- **Rate limiter** – exponential backoff for all external API calls (`src/lib/rateLimiter.ts`)
- **Authentication** – Supabase Auth with role-based access, protected by Next.js Edge Middleware for `/admin/*` and `/portal/*`
- **Cloud storage** – media uploads via Cloudflare R2 (server-side Route Handler)
- **Server-side rendering** – data fetched at the edge with explicit ISR caching

---

## 🛠 Tech Stack

| Layer        | Technology                                                |
| ------------ | --------------------------------------------------------- |
| UI framework | Next.js 15 (App Router) + React 19 + TypeScript           |
| Styling      | Tailwind CSS v4 (PostCSS)                                 |
| Animations   | Framer Motion, Lenis                                      |
| Icons        | Phosphor Icons                                            |
| Database     | Supabase (PostgreSQL)                                     |
| Auth         | Supabase Auth + `@supabase/ssr` + Next.js Edge Middleware |
| Storage      | Cloudflare R2 (AWS SDK v3)                                |
| Deployment   | Vercel                                                    |
| Testing      | Vitest + Testing Library                                  |

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local — fill in Supabase URL/key and R2 credentials

# 3. Start development server (http://localhost:3000)
npm run dev
```

> **Admin panel** is available at `http://localhost:3000/admin` once you have authenticated.
> **Artist portal** is available at `http://localhost:3000/portal` (artists sign in with their own Supabase Auth account linked to an artist row).

---

## 📜 Available Scripts

| Script                    | Description                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `npm run dev`             | Start Next.js development server (port 3000)                        |
| `npm run build`           | Production build (`next build`)                                     |
| `npm run preview`         | Preview the production build locally (`next start`)                 |
| `npm run lint`            | Run ESLint                                                          |
| `npm run ci`              | Full CI check: lint → tsc → test → build                            |
| `npm test`                | Run unit tests (Vitest)                                             |
| `npm run test:watch`      | Run tests in watch mode                                             |
| `npm run test:e2e`        | Run Playwright E2E & visual regression tests                        |
| `npm run analyze`         | Build with bundle analyzer enabled                                  |
| `npm run perf:bundle`     | Alias for `npm run analyze`                                         |
| `npm run perf:dev`        | Start turbo dev server for performance work                         |
| `npm run perf:build`      | Run production profiling build                                      |
| `npm run perf:analyze`    | Build with analyzer enabled                                         |
| `npm run perf:lighthouse` | Run Lighthouse CI locally                                           |
| `npm run perf:test`       | Run Playwright performance tests                                    |
| `npm run db:push`         | Push local Supabase schema changes to a configured Supabase project |
| `npm run db:diff`         | Generate a local schema diff with the Supabase CLI                  |

---

## 📈 Performance Monitoring

- **Lighthouse CI**: `.github/workflows/lighthouse-ci.yml` with budgets in `lighthouserc.js`
- **Web Vitals RUM**: `app/web-vitals.tsx` sends Core Web Vitals to `POST /api/vitals`
- **Bundle analysis**: enabled via `@next/bundle-analyzer` and `npm run analyze`
- **Playwright performance tests**: `tests/performance/core-web-vitals.spec.ts`
- **Bundle budget enforcement**: `scripts/check-bundle-budget.js` + `.github/workflows/performance-budget.yml`

---

## ✅ Quality Assurance

### Local QA commands

```bash
npm run ci          # full atomic check: lint → tsc → test → build
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run perf:test
npm run test -- tests/unit/ci-colors.spec.ts
```

### QA CI pipeline

The dedicated QA workflow (`.github/workflows/qa.yml`) runs five jobs:

- `lint-and-unit-tests` — ESLint + Vitest
- `e2e-tests` — Playwright route/security/feature checks
- `security-audit` — npm audit (high severity gate)
- `performance-tests` — Playwright performance assertions
- `ci-validation` — CI color policy enforcement

### Performance budgets

- Homepage LCP target: `< 2500ms` in local/prod-like runs (CI uses relaxed budget)
- Shared `rootMainFiles` bundle budget: `< 500KB` uncompressed

### Security validation procedures

- Verify unauthenticated access is blocked on protected UI routes
- Verify protected API endpoints reject missing/invalid JWTs
- Verify `SUPABASE_SERVICE_ROLE_KEY` is never leaked in browser-rendered HTML
- Verify RLS is enabled for sensitive Supabase tables

---

## 🔑 Environment Variables

Copy `.env.example` to `.env.local` and fill in your values.

### Client-side (`NEXT_PUBLIC_` prefix — exposed to the browser)

| Variable                        | Description                   |
| ------------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

### Server-side (Next.js Route Handlers / Edge Middleware only — never in the browser)

| Variable                          | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase service-role key — used by `/api/upload` to verify auth tokens |
| `CLOUDFLARE_R2_ACCOUNT_ID`        | Cloudflare account ID                                                   |
| `CLOUDFLARE_R2_ACCESS_KEY_ID`     | R2 API access key ID                                                    |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API secret access key                                                |
| `CLOUDFLARE_R2_BUCKET_NAME`       | R2 bucket name (e.g. `darktunes-assets`)                                |
| `CLOUDFLARE_R2_PUBLIC_URL`        | R2 public CDN base URL (e.g. `https://cdn.darktunes.com`)               |

### External API Keys (optional — Artist Auto-Sync)

| Variable                | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`     | Spotify app client ID (sync releases by Spotify Artist ID)                          |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret                                                           |
| `DISCOGS_TOKEN`         | Discogs personal access token (sync releases by Discogs Artist ID)                  |
| `SONGKICK_API_KEY`      | Songkick API key (sync tour dates by Songkick Artist ID)                            |
| `BANDSINTOWN_API_KEY`   | Bandsintown API key (sync tour dates by Bandsintown artist name)                    |
| `YOUTUBE_API_KEY`       | Google API key with YouTube Data API v3 (sync videos via `POST /api/sync-youtube`)  |
| `YOUTUBE_CHANNEL_ID`    | YouTube channel ID (starts with `UC`)                                               |
| `CRON_SECRET`           | Optional secret for Vercel cron requests to `POST /api/sync-youtube` (Bearer token) |
| `CONTACT_EMAIL`         | Email address for contact form submissions (defaults to `info@darktunes.com`)       |

### Supabase Read Replica (optional — Supabase Pro plan)

| Variable                    | Description                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_REPLICA_URL`      | Supabase read-replica URL (Pro plan). Routes heavy analytics/reporting queries away from the primary DB. Falls back to primary when unset. |
| `SUPABASE_REPLICA_ANON_KEY` | Anon key for the read replica.                                                                                                             |

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full setup instructions.

---

## 🗄 Database

The schema lives in **`supabase/reset.sql`** — a single fully idempotent script.
Types are defined in `src/types/database.ts`.
**Always keep both in sync** — see the schema change checklist in [AGENTS.md](./AGENTS.md).

To apply the schema (fresh or existing database):

1. Open the **Supabase SQL Editor** in the dashboard.
2. Paste the contents of `supabase/reset.sql` and click **Run**.

The script is safe to re-run at any time — it never deletes existing data.

---

## ♿ Accessibility & Quality

| Requirement           | Status | Implementation                                                                                                                                                                |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WCAG 2.1 AA**       | ✅     | Skip-to-main link, `lang` attribute, ARIA labels/roles on all interactive elements, decorative images `alt=""` + `aria-hidden`, 44 × 44 px touch targets, visible focus rings |
| **Reduced Motion**    | ✅     | `useReducedMotion()` (Framer Motion) in every animated component; transitions and stagger animations are disabled when the OS preference is set                               |
| **Artist Navigation** | ✅     | All artist cards navigate to `/artists/[slug]` via Next.js `<Link>`. No modal used for artist navigation                                                                      |
| **TypeScript `any`**  | ✅     | Zero `any` annotations in production code; ESLint enforces this                                                                                                               |
| **LenisProvider**     | ✅     | Single global instance in `app/_components/Providers.tsx`. No `scroll-behavior: smooth` in CSS (Lenis handles it)                                                             |
| **Code Splitting**    | ✅     | 15 heavy admin manager panels lazy-loaded via `React.lazy` + `Suspense` in `AdminDashboard`. `VideoModal` lazy-loaded in `Videos` (interaction-only)                          |

---

## 🚀 Deployment

Deployments run on **Vercel** with `"framework": "nextjs"` in `vercel.json`.  
Every push to `main` triggers an automatic production deployment.  
Branch pushes create preview deployments.

The custom install hook `scripts/vercel-install.sh` runs `npm ci` and validates all required environment variables before the build.

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for step-by-step setup.

---

## 📁 Project Structure

```
app/                          # Next.js App Router entry points
├── layout.tsx                # Root RSC layout (fonts, global CSS, Providers)
├── page.tsx                  # Home page RSC — server-side data fetch + ISR caching
├── globals.css               # Global CSS / Tailwind v4 theme
├── _components/              # App-level client wrappers
│   ├── HomePageContent.tsx   # "use client" home page shell (receives data as props)
│   └── Providers.tsx         # Lenis + Toaster + ErrorBoundary (client)
├── admin/                    # Protected admin routes — each feature has a dedicated page
│   ├── layout.tsx            # Admin route layout (sidebar + auth gate)
│   ├── page.tsx              # Admin overview (redirect to first tab)
│   ├── login/page.tsx        # Login page
│   ├── artists/              # Artist CRUD + invite
│   ├── releases/             # Release management
│   ├── news/                 # News CRUD (new + [id]/edit)
│   ├── videos/               # Video management
│   ├── assets/               # Folder-based Asset Explorer
│   ├── events/               # Concert/Event management (AdminConcertsManager)
│   ├── messages/             # Rich-text label inbox
│   ├── accreditations/       # Journalist accreditation review
│   ├── promo-log/            # Promo activity timeline
│   ├── release-submissions/  # Review + approve artist release submissions
│   ├── video-submissions/    # Review + approve artist video submissions
│   ├── accounting/           # SOS generator + statement history
│   ├── statements/           # (legacy — redirects to accounting)
│   ├── system/               # Health dashboard, Logs, Media, Maintenance
│   ├── press/                # Press portal management (photos, promo tracks, applications)
│   ├── colors/               # CI Color Theme editor
│   ├── features/             # Feature flags (global toggles + portal/journalist flags)
│   ├── settings/             # Site settings CMS (global, social, SEO, hero, legal)
│   └── users/                # User management + artist linking (admin-only)
├── portal/                   # Multi-tenant Artist Portal routes (/portal/*)
│   ├── layout.tsx            # Portal layout (server, renders sidebar)
│   ├── page.tsx              # Dashboard overview
│   ├── login/page.tsx        # Artist portal login
│   ├── onboarding/           # First-run onboarding wizard
│   ├── profile/              # EPK profile editor + PDF export
│   ├── analytics/            # Streaming analytics + earnings charts
│   ├── releases/             # Release management + checklist + submission form
│   │   ├── new/              # Submit new release
│   │   ├── submissions/      # Track own submission status
│   │   └── videos/new/       # Submit new video
│   ├── statements/           # Royalty statements (presigned R2 download)
│   ├── billing/              # Billing profile (invoice master data)
│   ├── invoices/             # Create + download invoices (SOS-linked or manual)
│   ├── tour/                 # Tour date management
│   ├── marketing/            # Promo log view + artist-owned asset uploads
│   ├── messages/             # Label inbox + rich-text replies
│   ├── documents/            # Document Vault (contracts, GEMA, split agreements)
│   ├── calendar/             # Unified calendar view
│   ├── interviews/           # Interview request management
│   ├── help/                 # Help & FAQ
│   └── settings/             # Password update + locale switch
├── press/                    # Journalist-facing routes
│   ├── page.tsx              # Public EPK / press landing page
│   ├── apply/                # Journalist application form
│   ├── artists/[slug]/       # Journalist-facing artist EPK page
│   ├── releases/[slug]/      # Journalist-facing release press page
│   ├── login/page.tsx        # Journalist login
│   └── dashboard/            # Protected journalist dashboard
│       ├── promo-pool/       # Journalist promo track player
│       ├── press-kit/        # EPK asset downloads
│       ├── press-releases/   # Embargo-aware press releases
│       ├── accreditation/    # Accreditation status + request
│       ├── interviews/       # Interview request flow
│       ├── contact/          # Contact label
│       ├── profile/          # Journalist profile
│       └── download-history/ # Download audit log
└── api/
    ├── upload/route.ts                    # Admin asset upload (R2 + SHA-256 dedupe)
    ├── sync-artist/route.ts               # Single-artist sync trigger
    ├── sync/route.ts                      # Enqueue async sync jobs for all artists
    ├── process-sync-queue/route.ts        # Claim + process one sync job (Vercel cron)
    ├── sync-youtube/route.ts              # YouTube channel video sync (Vercel cron)
    ├── revalidate/route.ts                # ISR cache busting (Supabase webhook)
    ├── revalidate-content/route.ts        # Targeted entity revalidation
    ├── revalidate-site-settings/route.ts  # Site-settings ISR revalidation
    ├── newsletter/                        # DOI subscribe / verify / unsubscribe
    ├── contact/route.ts                   # Contact form (Resend delivery)
    ├── exchange-rates/route.ts            # Live EUR exchange rates for invoices
    ├── health/route.ts                    # Health check endpoint
    ├── log-error/route.ts                 # Client-side error reporting (app_logs)
    ├── vitals/route.ts                    # Core Web Vitals RUM ingestion
    ├── journalist-applications/           # Journalist application CRUD
    ├── account/                           # Account export + deletion (GDPR)
    ├── upload-epk/route.ts                # Presigned EPK asset upload (R2)
    ├── upload-media/route.ts              # Presigned media upload (R2)
    ├── admin/
    │   ├── artists/                       # Artist CRUD + Spotify/iTunes prefill + Discogs enrich
    │   ├── assets/                        # File explorer APIs (list, folders, batch, storage stats)
    │   ├── media/                         # Media library APIs (list, folders, batch)
    │   ├── concerts/route.ts              # Admin concert management (any artist)
    │   ├── feature-flags/[id]/route.ts    # Toggle portal/journalist feature flags
    │   ├── users/                         # User management (role, ban, delete, link-artist, invite)
    │   ├── roles/                         # Role permissions + custom roles CRUD
    │   ├── sales-statements/              # Statement approval workflow
    │   ├── release-submissions/           # Review + approve artist release submissions
    │   ├── video-submissions/             # Review + approve artist video submissions
    │   ├── promo-log/                     # Promo log CRUD + proof upload
    │   ├── sos/                           # SOS presets + period summaries
    │   ├── submission-form-schema/        # Configurable release/video submission schemas
    │   ├── maintenance/                   # Maintenance tasks (clear logs, purge releases, etc.)
    │   ├── cleanup-orphaned-releases/     # Delete releases where artist_id IS NULL
    │   ├── enrich-artist-discogs/         # Manual Discogs artist profile fetch
    │   ├── fetch-artist-image/            # Auto-fetch artist image from Spotify
    │   ├── fetch-youtube-info/            # YouTube video metadata lookup
    │   ├── prefill-artist/               # Spotify artist data prefill
    │   ├── prefill-artist-itunes/        # Apple Music artist data prefill
    │   ├── resolve-release-smart-link/   # Odesli smart-link resolution
    │   ├── rbac-audit/route.ts            # RBAC audit report
    │   └── send-external-email/          # Admin-triggered outbound email
    └── portal/
        ├── submit-release/route.ts        # Create release submission (is_visible=false)
        ├── submit-video/route.ts          # Create video submission
        ├── upload-photo/route.ts          # Profile photo upload to R2
        ├── upload-release-cover/route.ts  # Release cover upload to R2 (max 5 MB)
        ├── upload-asset/route.ts          # Artist-owned asset upload/delete (max 20 MB)
        ├── upload-rider/route.ts          # Technical rider upload
        ├── profile/route.ts               # Upsert artist EPK profile
        ├── billing-profile/route.ts       # Billing profile upsert
        ├── checklist/route.ts             # Release checklist item toggle
        ├── concerts/                      # Artist concert CRUD + ICS export
        ├── documents/                     # Document Vault upload/download/delete
        ├── invoices/                      # Invoice CRUD + PDF generation
        ├── messages/                      # Portal messages (inbox, send, folders, per-message)
        ├── release-submissions/           # Artist release submission status
        ├── video-submissions/             # Artist video submission status
        └── interview-requests/            # Interview request management
middleware.ts                 # Edge Middleware — auth for /admin/*, /portal/*, /press/dashboard/*
src/
├── components/               # UI components (Header, Hero, Releases, Artists, …)
│   ├── admin/                # Admin panel + manager components ("use client")
│   │   ├── file-explorer/    # Folder tree, grid/list views, upload dropzone, asset picker
│   │   └── forms/            # Admin CRUD form components
│   ├── animations/           # LenisProvider ("use client")
│   └── ui/                   # Shadcn/Radix primitives
├── hooks/                    # Custom React hooks (useArtists, useReleases, …)
├── lib/                      # Business logic, API clients, utilities
│   ├── api/                  # Data Access Layer — one file per DB table
│   │   ├── artistProfiles.ts # EPK profile DAL + resolvePortalArtist
│   │   ├── streamingStats.ts # Streaming stats DAL
│   │   ├── salesStatements.ts# Royalty statements DAL
│   │   ├── artistDocuments.ts# Document Vault DAL
│   │   └── artistRowMapper.ts# Shared ArtistRow → Artist domain mapper
│   ├── sync/                 # Multi-API sync engine (iTunes, Spotify, Discogs, Odesli, …)
│   ├── portal/               # Portal utilities (presigned URLs)
│   ├── email/                # Email sending utilities (Resend)
│   ├── sos/                  # SOS validation + CSV processor
│   ├── supabase/
│   │   ├── server.ts         # Server client (cookies-based)
│   │   ├── client.ts         # Browser client
│   │   └── replica.ts        # Read-replica client (falls back to primary)
│   ├── rateLimiter.ts        # withExponentialBackoff + HttpError
│   ├── imageUtils.ts         # wsrv.nl proxy helpers
│   ├── r2Utils.ts            # R2 upload/delete helpers
│   ├── slugify.ts            # Canonical toSlug (German umlauts → ASCII)
│   └── env.server.ts         # Zod server-side env validation
├── workers/                  # Web Workers (image processing, SOS CSV)
└── types/                    # TypeScript types (database.ts, users.ts, …)
supabase/
├── reset.sql                 # Single idempotent SQL script — full schema source of truth
└── functions/                # Supabase Edge Functions (Deno runtime)
scripts/
└── vercel-install.sh         # Vercel build hook (npm ci + env var validation)
```

---

## 🎨 Brand Colors

| Token          | Hex       | Usage                                  |
| -------------- | --------- | -------------------------------------- |
| `--primary`    | `#493687` | Violet – CTAs, active nav, focus rings |
| `--secondary`  | `#7e1e37` | Pink – hover, promo badges             |
| `--background` | `#101010` | Near-black page background             |
| `--card`       | `#292929` | Cards, modals, player bar              |
| `--border`     | `#383838` | Subtle borders, inputs                 |
| `--foreground` | `#ffffff` | Primary text                           |

---

## 📄 License

Proprietary — All Rights Reserved. See [LICENSE](./LICENSE).
