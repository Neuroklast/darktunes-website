# Data Layer & Schema

## Single source of truth

UI data originates from Supabase. After writes, invalidate ISR via the relevant revalidate endpoint. Client components reconcile with server responses after mutations.

**Tenant brand:** `site_settings.label_name` + `label_short_name` (CMS). Code reads via `getBrandContext()` / `resolveBrandFromSettings()` in `src/lib/brand/`. Bootstrap when DB is empty: `TENANT_*` env vars → `SITE_SETTINGS_DEFAULTS` (neutral fallbacks only in TypeScript). No hardcoded tenant names in `app/` or `src/` — enforced by `npm run check:brand`.

`unstable_cache` callbacks must use a **cookie-free** anon client — never `createServerSupabaseClient()` (calls `cookies()`). See `AGENTS.md`.

## Data access layer (`src/lib/api/`)

- One file per table; `SupabaseClient<Database>` as first argument
- Throw on Supabase errors; `PGRST116` on `.single()` → return `null`
- `rowTo*` mappers: snake_case → camelCase; nullables → `undefined` or `''`
- Shared: `rowToArtist()` in `artistRowMapper.ts`
- Press reads/writes: `pressKit.ts` (`assets` + `press_kit_items`; legacy `press_photos` backfill only)

Hooks in `src/hooks/` wrap DAL; short-circuit when `isSupabaseConfigured` is false.

**Public vs admin:** `getPublicArtists` / `getPublicArtistBySlug` / `getPublicRelatedArtists` (`publicArtist.ts`) use **column whitelist only** — never secrets. Full `getArtists` / `getArtistById` merge `artist_private_data` for staff/portal. Releases/concerts still filter `is_visible`; releases also `is_promo = FALSE`. Admin hooks use unrestricted getters.

**Private artist secrets:** Table `artist_private_data` (`email`, `vat_number`, `notes`, `bandsintown_api_key`, `storage_quota_bytes`, `is_eu_non_german`). DAL: `artistPrivateData.ts` + dual-write in `updateArtist`/`createArtist` and portal Bandsintown routes. Cron/`syncAll` and Health must read Bandsintown keys from this table (public `artists.bandsintown_api_key` is nulled). Public EPK: `publicArtistEpk.ts` + service-role only (no anon RLS on `artist_epks`).

**Server clients:** `createServerSupabaseClient()` (RSC/handlers), `createBrowserSupabaseClient()` (client). **Deprecated:** `src/lib/supabase.ts`.

**Env:** `src/lib/env.server.ts` (Zod, throws at startup). External API keys → encrypted `api_credentials` (not env). Master key: `API_CREDENTIALS_ENCRYPTION_KEY`.

## ISR cache tags

List-level: `artists`, `releases`, `news`, `videos`, `concerts`, `site-settings`, `artist-profiles`, `sync-logs`, `portal-faq`.

Entity-level (combine with list tag): `artist-${slug}`, `release-${id}`, `news-${slug}`.

`POST /api/revalidate-content` accepts optional `entityTags` for webhook-driven invalidation.

**Portal calendar:** `getCachedCalendarReleases` (`releases` tag) + `getCachedCalendarConcerts` (`concerts` tag) in `src/lib/cache/publicQueries.ts`. Slim nested selects only; no cookie-bound Supabase inside those cache callbacks.

## R2 object keys

Store key in DB `r2_key` column for cleanup via `deleteObjectFromR2`.

| Prefix | Use |
|--------|-----|
| `artists/{artistId}/` | Artist images |
| `releases/{releaseId}/` | Cover art |
| `profile-photos/{artistId}/` | Portal photos |
| `release-covers/{artistId}/` | Portal release covers |
| `statements/{artistId}/` | SOS PDFs |
| `invoices/{artistId}/{invoiceId}.pdf` | Issued invoice PDFs (write-once; store `pdf_sha256`) |
| `artist-assets/{artistId}/` | Marketing uploads |
| `artist-documents/{artistId}/` | Document vault |
| `press-kit/{category}/` | EPK assets |
| `promo-tracks/` | Journalist audio |
| `sos-imports/{batchId}/` | Bronze CSV archives |

Bronze limits: SSOT `src/lib/sos/bronzeUploadLimits.ts` only.

**Statement provenance:** `sales_statements.batch_id` → `distributor_import_batches` (`file_hash`, `distributor`, period, `r2_key`). Portal artists may SELECT linked batches (policy `distributor_import_batches: artist read linked`). Source CSV download is server-streamed only.

**SOS uniqueness (partial indexes, live-DB `IF NOT EXISTS`):**
- `sales_statements_one_draft_per_period` — `(artist_id, period_start, period_end)` where `status = 'draft'` and `document_type IS DISTINCT FROM 'storno'`
- `artist_invoices_one_per_statement` — `(statement_id)` where `statement_id IS NOT NULL`
- `distributor_import_batches_file_hash_active` — `(file_hash)` where `file_hash IS NOT NULL` and `status IS DISTINCT FROM 'failed'`

## Schema management

⛔ **No** `supabase/migrations/`. Only `supabase/reset.sql` + `src/types/database.ts`.

CI: `npm run verify:schema-columns` (part of `ci:contracts` / `npm run ci`) **fails** if any `supabase/migrations/*.sql` file exists. Empty dir / README-only is fine. Fold all schema into idempotent `reset.sql` + update `src/types/database.ts`.

Schema change checklist:

1. `supabase/reset.sql` — CREATE + idempotent `ADD COLUMN IF NOT EXISTS`
2. `src/types/database.ts` — Row/Insert/Update shapes
3. Affected hooks/DAL
4. Compliance with `supabase/DB_REQUIREMENTS.md`

**reset.sql order:** extensions → enums → helper functions → tables → RLS → backfills.

`has_permission(perm TEXT)` — one argument only. ✅ `has_permission('can_manage_releases')` — ❌ `has_permission(auth.uid(), …)`.

Apply: paste `reset.sql` into Supabase SQL Editor (idempotent on live DB).

## Read replica

`createReplicaSupabaseClient()` in `src/lib/supabase/replica.ts` — read-only; falls back to primary. Use for heavy analytics reads; never for writes or inside `unstable_cache`.

## Analytics gold layer

| Table | Persist path |
|-------|--------------|
| `artist_territory_metrics`, `streaming_stats` | Accounting → Save to Portal. Territory `revenue_eur` is the artist share (not processor gross). |
| `sos_period_summaries` | Same (optional) |
| `event_impact`, `promo_impact` | Recomputed on persist |
| `merch_orders` | Worker → persist |
| `page_events` | `POST /api/page-events` |
| `epk_download_events` | Export routes |
| `artist_listener_metrics` (`source`: lastfm \| soundcharts \| **apify**) | Admin listener sync / Apify Spotify plays |
| `spotify_track_play_snapshots` | Apify album scrapes — public lifetime play counts per track/period (**not** SOS) |
| `apify_usage_months` | Monthly Apify URL budget counter (default 1200) |

**Apify vs SOS:** Public Spotify scrapes must never write `streaming_stats` / territory revenue gold. Portal copy labels Apify as non-settlement.

Portal analytics uses authenticated primary client (RLS), not replica.