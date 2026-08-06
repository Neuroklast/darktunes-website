# Lessons Learned

Distilled anti-patterns from project history. **Append session findings before opening a PR** when the session uncovered a recurring anti-pattern or process gap — see `docs/agent/workflow.md` → *Living docs*.

---

## Database & schema

| Anti-pattern | Rule |
|--------------|------|
| Files in `supabase/migrations/` | ⛔ Forbidden. Only `supabase/reset.sql` + `src/types/database.ts` |
| Helpers after tables that use them | Order: extensions → enums → **functions** → tables → RLS → backfills |
| CREATE-only columns on evolved tables (`artists`, …) | Live DBs no-op `CREATE TABLE IF NOT EXISTS` — every non-structural column needs `ADD COLUMN IF NOT EXISTS` (`verify:schema-columns`) |
| Denormalised columns across related tables | Check `supabase/DB_REQUIREMENTS.md` first (3NF) |
| `has_permission(auth.uid(), …)` | ✅ `has_permission('can_manage_releases')` — one arg only |
| `CREATE TYPE IF NOT EXISTS` in Supabase SQL Editor | Use `DO $$ … IF NOT EXISTS (pg_type) …` blocks |

## Next.js & RSC

| Anti-pattern | Rule |
|--------------|------|
| DOM libraries in Server Components | `"use client"` leaf; pass props from RSC |
| `createServerSupabaseClient()` in `unstable_cache` | Cookie-free anon client only (see `AGENTS.md`) |
| Async routes without `loading.tsx` | Skeleton must match loaded layout (zero CLS) |
| Missing `metadata` / `generateMetadata` | Never `<title>` in JSX |
| Logo via `getOptimizedImageUrl(..., 200)` in chrome | Use `getOptimizedLogoUrl` + source ≥2–3× display size; small PNGs stay soft on Retina |
| Permanent PWA dismiss with no re-entry | Store dismiss, but always expose `requestPwaInstallPrompt()` from Footer/Settings |
| Legal page body only in one language | Labels/boilerplate via `next-intl`; CMS fields stay bilingual when needed |
| Hard-coded `locale === 'de' ? 'de-DE' : 'en-US'` | Use `toBcp47(locale)` from `src/i18n/locales.ts` so FR (and future locales) format correctly |
| New locale without full message tree | Add `messages/<locale>/*` with key parity vs EN; extend `loadMessages` loaders + `LOCALES` + parity tests |
| Flag emoji in locale switcher | On Windows, regional-indicator emoji show as letters (DE/GB/FR) — use SVG flags |
| `router.refresh()` for locale cookie change | Force-dynamic portal/admin often lag or ignore; use cookie + full navigation |
| Locale switcher in header *and* sidebar footer | One chrome control per surface; dedicated Settings card may still host one |
| SW NetworkFirst cache for dashboard HTML | Locale/cookie-dependent shells (`/admin`, `/portal`, …) must be NetworkOnly or language switches serve stale HTML |

## CI & TypeScript

| Anti-pattern | Rule |
|--------------|------|
| PR without full check sequence | `lint` → `tsc` → `test` → `build` — all green in one run |
| Lockfile not updated after dep change | Run `npm install`; commit `package-lock.json` |
| `as any` / `@ts-ignore` / `eslint-disable` to silence CI | Fix root cause |
| Code shipped without docs/markdown refresh | Agents **always** update docs at session end (`AGENTS.md` + `docs/agent/workflow.md`); stale README/agent/living docs = incomplete work |

## Lenis & scroll

| Anti-pattern | Rule |
|--------------|------|
| `overflow-y-auto` in admin/portal without `data-lenis-prevent` | Lenis blocks wheel scroll otherwise |
| Second `LenisProvider` or CSS `scroll-behavior: smooth` | Single root provider only |
| `getComputedStyle` inside scroll handlers | Cache layout reads in refs |

## Images & media

| Anti-pattern | Rule |
|--------------|------|
| Bare `<img>` | `next/image`; wsrv URLs via `getOptimizedImageUrl` / `getSquareThumbnail` |
| Raw R2 URL on `<Image>` without wsrv | Vercel `/_next/image` → Hobby limit → HTTP 402; use `imageUtils` + `unoptimized` |
| Double-proxy wsrv.nl URLs | Proxy only raw origin URLs |
| `<Image fill>` without `sizes` | Always add accurate `sizes` per layout breakpoint — prevents over-downloading near-viewport images |
| `<Image>` above the fold without `priority` | Add `priority` to hero, first-card, and other LCP-candidate images |
| `createPublicSupabaseClient` copied into page files | Import from `@/lib/supabase/publicClient` — the single SSOT |
| `generateMetadata` + page fetching same row | Wrap with `React.cache()` to deduplicate within the same request |
| Phosphor `Image` + `next/image` clash | `import { Image as ImageIcon }` |

## Security

| Anti-pattern | Rule |
|--------------|------|
| Unsanitised `dangerouslySetInnerHTML` | `sanitizeHtml()` / DOMPurify on client |
| URL checks via `includes()` | Parse hostname or `startsWith` on origin |
| PII in `app_logs` | UUIDs only; no emails/names |
| Vulnerable deps without audit | `npm audit` before adding packages |
| Browser `fetch()` to bronze CSV presigned R2 URLs | Same-origin `/api/admin/sos/import-batches/*` only |
| Process SOS CSVs while `exchangeRates` is still `{}` | Gate worker `process` until rates non-empty; sticky FX banner on ECB fallback |

## Accessibility & i18n

| Anti-pattern | Rule |
|--------------|------|
| Icon links without `aria-label` | WCAG AA is a pre-merge gate |
| Dialogs without `aria-labelledby` | + `useReducedMotion`, `aria-pressed` on toggles, 44px targets |
| Hardcoded English strings | `en.json` + `de.json`; RSC passes dict as props |
| `alert()` / `confirm()` | `sonner` toasts |

## Portal tenancy

| Anti-pattern | Rule |
|--------------|------|
| Client pages that only read `?artistId=` with no server fallback | RSC `resolvePortalArtist` + always append resolved id in nav (`activeArtistId ?? activeArtist.id`) |
| One mega-dashboard mixing unrelated data sources | Separate nav items when sources differ (e.g. Spotify public vs SOS statements) |
| Returning stored secrets to portal clients | Mask secrets (`hasApiKey`); empty input keeps existing key |
| Bell mark-all only flips legacy `read` flags | Badge counts use `message_receipts` when `userId` is set — always write receipts on mark-read / mark-all |

## State & UI

| Anti-pattern | Rule |
|--------------|------|
| Admin form state derived from parent list on render | Local `react-hook-form` state; sync on save |
| `documentElement.style` for theme preview | Declarative `<style>` tag + `useReducer` (`ColorThemeManager`) |
| Fixed `max-w-lg` modals | Viewport-relative breakpoints — see `docs/agent/frontend.md` |
| `setTimeout` for drag-vs-click | Pointer delta tracking or library-native events (Swiper) |

## CSP & performance

| Anti-pattern | Rule |
|--------------|------|
| New external domain without CSP update | SSOT: `src/lib/security/contentSecurityPolicy.ts` |
| Heavy libs in initial bundle | `React.lazy()` / `next/dynamic`; verify with `npm run analyze` |
| Bundle checks by chunk filename | Use `app-build-manifest.json` route paths |
| `URLSearchParams` for Spotify `include_groups` | Manual query string (commas must not encode) |

## Auth & RLS

| Anti-pattern | Rule |
|--------------|------|
| `get_my_role()` on `profiles` RLS | Direct `auth.uid() = id` on profiles table |
| Anon client for admin bypass ops | Service-role in route handlers / Server Actions |
| Column type change without dropping policies | `DROP POLICY IF EXISTS` before `ALTER COLUMN` |
| `select('*')` + full domain mapper on public RSC | Public column whitelist + `PublicArtist`; secrets in private table |
| RLS row filter only while secrets share the public table | Row-level ≠ column-level — move secrets off the public-readable row |
| `authenticated read` on shared media tables | Staff permission or press-approved flags — not every logged-in user |

## Session additions

### 2026-08-06 — Public data / a11y hardening

- **Finding:** Visible `artists` rows exposed `bandsintown_api_key`, email, VAT, notes via anon RLS + `rowToArtist` into client components.
- **Fix:** `publicArtist.ts` whitelist, `artist_private_data` dual-write, RLS for videos/assets/epks/settings, public a11y targets.
- **Ops:** Apply `supabase/reset.sql` policy/table sections on live DB after deploy.

## Documentation

| Anti-pattern | Rule |
|--------------|------|
| Feature shipped without doc update | End-of-session review: `README`, `DEPLOYMENT`, `ADMIN`, `INTEGRATION-SUMMARY`, `docs/agent/*`, `CHANGELOG`, `QA_CHECKLIST` |
| Living docs orphaned after doc debloat | Keep `CHANGELOG`, `LESSONS_LEARNED`, `QA_CHECKLIST` in `workflow.md` docs-review table and `AGENTS.md` |
| Size limits from memory | Derive from source constants (e.g. upload route `MAX_*_BYTES`) |
| Bloated duplicate prose across agent docs | Progressive disclosure: `AGENTS.md` index + topic files |

---

## Session additions

### 2026-08-04 — Legal billing / VIES / IBAN / FX

**Reverse charge without a hard VIES gate is a tax risk:** Do not allow `tax_status = reverse_charge` without a VAT ID, and do not store VIES downtime as `valid: false` (keep the last good snapshot). Re-check VIES at invoice create. **IBAN stays local-only** (ISO 7064) — never third-party bank APIs (DSGVO). Label recipient party and invoice email brand must come from `site_settings`. SOS-linked invoices should 422 if label contact email/address is missing in CMS.

### 2026-07-23 — Cover art CORS vs client-side checks

**Never verify remote cover URLs in the browser when artists use Drive/Dropbox:** `Image` + CORS `fetch` fail silently on hosts without ACAO → submit permanently blocked. Run dimension/format checks **server-side** (allowlist + SSRF guards), normalize Drive share URLs to download endpoints, and re-verify on submit so clients cannot spoof `coverArtVerified`.

**Wizard steps from `field_group`, not hard-coded keys:** Admin-customizable forms stay maintainable when the portal derives steps from schema groups; only bookend steps (type / tracks / review) are fixed.

### 2026-07-22 — Sync cover storms, fake progress, Odesli thrash

**Parallel queue executors storm R2 DNS:** Admin pollers that `POST /api/sync` every few seconds while a prior `waitUntil` is still alive multiply concurrent cover uploads → `getaddrinfo EBUSY` on R2. Fix with a single-flight executor lease + client kicks only when `running === 0`, lower release/R2 concurrency, and retry transient DNS.

**Progress must use this run’s backlog:** `getSyncQueueStats().done` is last-24h global — not batch progress. Never set the UI to 100% unless the queue actually drained.

**Do not retry 429 inside the request:** Rate limits belong to the queue cooldown (`RATE_LIMIT_JOB_COOLDOWN_MS`). Retrying Odesli 429s with exponential backoff burns the function budget and prolongs thrash. Batch artist `platform_links` like releases.

### 2026-07-21 — Sync queue accepted ≠ public/admin UI updated

**Enqueue success is not data freshness:** `POST /api/sync` returns `{ accepted: true }` immediately via `waitUntil`. Admin hooks that `load()` in `finally` right after that response show the **pre-sync** DB snapshot. Poll queue stats (`GET /api/sync/queue`) and re-kick the executor until idle (or timeout), then reload + revalidate.

**Videos are not on the artist queue:** Full/Spotify/Discogs/Odesli jobs never write `videos`. Channel sync is only `/api/sync-youtube` (or `sync-api` youtube). Do not expect release sync to refresh the videos page.

**Public reads are Data Cache + ISR, not live Supabase:** `getCachedPublic*` uses `unstable_cache` (tags, up to 1h TTL). `revalidateTag` alone can leave list routes stale; pair with `revalidatePath` for `/`, `/releases`, `/videos`, etc. (`revalidatePublicContent`). Admin mutations must also call `/api/revalidate-content` (videos CRUD was missing this).

**Do not alias GET to POST on queue routes:** `GET = POST` on `/api/sync/queue` made "read stats" enqueue jobs. Separate GET (stats) from POST (enqueue).

### 2026-06-25 — Settlements guided workflow + doc debloat

**Guided wizard must be controlled, not self-contained:** `AccountingGuidedWizard` needs `activeStep` / `onActiveStepChange` from `AccountingPanel`. A Review-step CTA that called `setViewMode('guided')` without setting step to `settle` left operators on the wrong screen. Scroll targets (`#accounting-guided-settle-panel`) need explicit step state.

**Inline billing belongs at every invoice entry point:** Gating only `InvoiceForm` left `FreeInvoiceGenerator` and quick-invoice buttons able to generate PDFs without complete `artist_billing_profiles`. Every portal invoice surface must call `isBillingProfileComplete()` or render `InlineBillingProfileStep` first.

**Integration summary as status matrix, not implementation dump:** A 300-line feature inventory duplicated `README.md` and `docs/agent/features.md` and a table of 60 rows all marked ✅ added no signal. Prefer area × status tables and entry-point links.

**Lessons doc: rule tables over commit archaeology:** Evidence commit lists help once; recurring rules belong in compact anti-pattern → rule tables. Update stale references when SSOT moves (CSP → `contentSecurityPolicy.ts`, modals → `frontend.md`).

### 2026-07-03 — Living docs dropped from agent workflow after debloat

**Debloat removed the triggers, not the files:** `LESSONS_LEARNED.md` pointed at `workflow.md`, but `workflow.md` never listed `CHANGELOG`, `LESSONS_LEARNED`, or `QA_CHECKLIST`. Agents followed the slim `AGENTS.md` review list and stopped updating living docs. Rule tables are SSOT for recurring anti-patterns; session additions and changelog/QA updates still belong in their respective files — wire all three back into `workflow.md` and `AGENTS.md`.

### 2026-07-06 — ISR pre-rendering, loading skeletons, eslint-disable root-cause fixes

**`generateStaticParams` is not optional for ISR detail pages:** `releases/[id]` and `news/[slug]` had `revalidate: 60` in `unstable_cache` but no `generateStaticParams()`, so the first hit after a cold deploy was always a slow on-demand render. Always pair `revalidate` with `generateStaticParams` + `dynamicParams = true` on dynamic segments.

**`useCallback` before usage — lexical order matters:** Moving `uploadProofFile` from a plain `async function` to `useCallback` meant it became a `const` (block-scoped variable). `handlePaste` defined above it in source order referenced it in its dependency array, causing a TypeScript `used before declaration` error. Always define `useCallback`-wrapped helpers before the callbacks that depend on them.

**Functional `setState` updaters eliminate loop-causing deps:** When a `useEffect` sets state and reads that state to decide whether to set it again, adding the state value to deps creates an infinite loop. The fix — `setActiveTab((current) => ...)` — reads the latest state inside the updater, removing the need for `activeTab` in the dependency array.

**Stable-ref pattern for single-init effects:** Worker init (`useSosCSVProcessor`) and DOM event listener registration (`ArtistForm`, `FileExplorer`) legitimately run once. The clean pattern: store the latest callback in `someRef.current = callback` (updated on every render) and call `someRef.current()` from inside the effect, keeping the dep array empty without any suppression.

**`generateInvoicePdf` sync → async:** CJS `require()` was needed because the function was synchronous. Converting to `async` with `await import('jspdf')` / `await import('jspdf-autotable')` eliminates the `@typescript-eslint/no-require-imports` suppressions. Both callers (route handler + server action) are already async.

### 2026-07-21 — Settlement ledger + press visibility + API/UI auth parity

**Invoice liability and payment must not both reduce open balance:** Once `invoice_liability` zeros `statement_payout`, payment status lives on the invoice (`paid_amount_cents`); a second ledger `payment` row leaves permanent negative balance and corrupts carry-forward.

**Approve gates belong in the DAL, not only in bulk routes:** Single-approve without `.eq('status','draft')` and without ledger idempotency doubles royalties on retry.

**Correction drafts must not hide the original:** Supersede + ledger delta on create remove the only artist-visible statement until approve; move both to correction approve.

**UI admin-only paths must match API auth:** Editors blocked from `/admin/statements` in the proxy still called `verifyAdminOrEditor` finance/SOS routes until APIs used `verifyAdmin` / admin-only role checks.

**Public content filters need RLS + app:** `is_press_only` only in app is insufficient if anon RLS still returns press rows; keep both in sync.

**Never inject raw admin CSS:** Theme `customCss` into `<style>` without stripping `</style` / script patterns is site-wide XSS when CSP allows `unsafe-inline`.

**Local sanitize wrappers that no-op on SSR defeat the SSOT:** MessagesInbox returned raw HTML when `window` was undefined; always use `@/lib/sanitizeHtml`.

### 2026-08-04 — Health last-run buried by chatty APIs; void heartbeats

**Global recent-N `sync_logs` is not “latest per API”:** Taking the first row per source from a lookback/limit window makes quiet APIs show “Never” when one source floods the table. Query `order created_at desc limit 1` **per** `api_source` for last-run cards; keep 24h stats as a separate capped aggregation.

**`void recordHealthHeartbeat` + early return drops evidence:** Fire-and-forget heartbeats race isolate freeze after `alreadyRunning` responses. Await heartbeats at kick, refresh during long drains, and write again in `finally`. Concurrent RMW heartbeat upserts need a short retry so cron keys do not clobber each other.

**Item promo must not mix with site hero copy:** Release `promoText` / news `excerpt` always wins for the homepage hero teaser; global `heroDescription` is fallback only when the featured item has no body text.

---

*Last updated: 2026-08-04*