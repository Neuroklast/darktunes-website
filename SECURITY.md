# Security Policy — darkTunes Music Group

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | ✅ |
| Older branches | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainers directly (see repository contacts) or via [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

Include as much detail as possible:

- Type of vulnerability (e.g. XSS, SQL injection, broken auth)
- Affected file(s) and line numbers
- Steps to reproduce
- Potential impact

We will respond within 72 hours and coordinate a fix before any public disclosure.

## Security Practices

- **Row-Level Security (RLS)** is enabled on all Supabase tables. Only authenticated users with the `admin` or `editor` role can write data. Portal tables (`artist_epks`, `artist_billing_profiles`, `streaming_stats`, `sales_statements`, `release_checklists`, `artist_replies`, `artist_assets`, `artist_invoices`) enforce artist-scoped RLS using ownership checks via `artist_members` — security is enforced at the database layer, not just middleware.
- **Multi-tenant isolation**: `artists.user_id` links each artist to a Supabase Auth user. Artists can only access their own rows — even if the client manipulates requests, RLS at the DB layer prevents cross-tenant data access.
- **Environment variables** containing secrets (`SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, etc.) are never prefixed with `NEXT_PUBLIC_` and are therefore never exposed to the browser. Client-safe variables use the `NEXT_PUBLIC_` prefix.
- **Supabase anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is intentionally public (client-side) but is scoped by RLS policies.
- **File uploads** go through Next.js Route Handlers (`app/api/upload/route.ts`, `app/api/portal/upload-photo/route.ts`, `app/api/portal/upload-release-cover/route.ts`, `app/api/portal/upload-asset/route.ts`, `app/api/portal/documents/upload/route.ts`) — R2 credentials are never accessible from the browser. The admin upload route requires `admin` or `editor` role, computes a SHA-256 hash to deduplicate identical files, and creates the `assets` row server-side. Portal uploads enforce strict type/size limits (profile and release cover images max 5 MB; artist assets and documents max 20 MB; limited MIME types). The documents upload only accepts `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- **Service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — it is used exclusively in route handlers for token verification and must never be exposed to the client.
- **Admin asset management APIs** (`/api/admin/assets`, `/api/admin/assets/folders`, `/api/admin/assets/batch`) all reuse the shared admin/editor auth helpers. Destructive deletes remove R2 objects before deleting database records, reducing orphaned-file risk.
- **Presigned URLs** for private R2 PDFs expire in 300 seconds (5 minutes). URLs are generated in a Server Action; R2 credentials and the raw R2 object key are never sent to the browser.
- **Billing profile enforcement**: the portal invoice API returns HTTP 422 until `artist_billing_profiles` contains the minimum legal invoice fields (name, address, country, and tax number or VAT ID). Reverse-charge profiles additionally require a **VIES-valid** EU VAT ID (checked via the European Commission REST API on billing save and again at invoice create). Invalid VIES or VIES downtime blocks reverse-charge saves/invoices rather than silently issuing PDFs.
- **IBAN privacy**: bank account numbers are validated only with the in-process ISO 7064 implementation (`src/lib/sos/iban-validator.ts`). Do **not** send IBAN/BIC to third-party validation SaaS (DSGVO).
- **Invoice PDF immutability**: once `pdf_url` / `pdf_sha256` are set on `artist_invoices`, the app refuses overwrite (GoBD-oriented write-once). Enable R2 bucket versioning for `invoices/` and `statements/` in ops (see `DEPLOYMENT.md`).
- **Portal AGB acceptance**: artists must accept versioned portal terms (`artists.portal_terms_*` vs `site_settings.portal_terms_version`) before using the portal (onboarding step + layout gate).
- **Admin + Portal route protection** is enforced by Next.js Edge Middleware (`middleware.ts`). Auth checks happen server-side at the edge before any page HTML is rendered, preventing client-side flicker attacks.
- **Artist auto-sync** (`POST /api/sync/artist`) validates `Authorization: Bearer <token>` via `supabase.auth.getUser()` before running any sync logic. R2 credentials are never exposed to the browser.
- **Cron endpoint auth** (all sync routes: `/api/sync`, `/api/sync/queue`, `/api/sync/requeue`, `/api/sync-youtube`, `/api/sync-api`) — scheduled calls use `CRON_SECRET` (mandatory for cron triggers). Manual user JWT calls require **admin or editor** role (or a custom role with `sync.trigger` capability via `verifySyncTrigger`). A missing or wrong secret is rejected with HTTP 401. This prevents unauthenticated or under-privileged callers from triggering resource-intensive sync jobs.
- **External API rate limiting** — all calls to external APIs (iTunes, Spotify, Discogs, Songkick) go through `withExponentialBackoff()` from `src/lib/rateLimiter.ts`. This prevents runaway requests and provides graceful handling of HTTP 429 / 5xx responses.
- **External API credentials** (Spotify, Discogs, Resend, YouTube, MailerLite, etc.) are stored AES-256-GCM encrypted in the Supabase `api_credentials` table (admin-only RLS). The encryption master key `API_CREDENTIALS_ENCRYPTION_KEY` lives only in Vercel env (or `.env.local` locally) — never in Supabase, never in `site_settings`, never sent to the browser. Admin UI (`/admin/api-keys`) never receives decrypted values on GET; decryption happens server-side only in Route Handlers via `src/lib/secrets/getExternalCredentials.ts`. Supabase/Cloudflare bootstrap secrets and infra tokens (`CRON_SECRET`, `REVALIDATE_SECRET`) remain in env vars.
- **Image caching** — external cover art images are downloaded server-side and uploaded to Cloudflare R2. The browser only ever loads images from R2 (via wsrv.nl proxy). External image URLs are never stored in the database or sent to the browser.
- **Rich-text messaging sanitization** — `label_messages.body_html` and `artist_replies.body_html` store formatted content. Every render path sanitizes the HTML with `sanitizeHtml()` from `src/lib/sanitizeHtml.ts`, which applies a regex-based server-safe pass during SSR and delegates to DOMPurify on the client, before using `dangerouslySetInnerHTML`. This covers both the initial server-rendered response and the client hydration, reducing XSS risk across the admin inbox, artist portal, and all other rich-text surfaces (bio fields, privacy policy, about page).
- Dependencies are kept up to date. Run `npm audit` before adding new packages.

## CSRF Protection

CSRF protection is NOT needed for Route Handlers that verify a ******
(admin/portal routes). For Server Actions, Next.js App Router enforces
same-origin checking automatically via the `Origin` header.
Do NOT add manual CSRF token middleware — it would conflict with Server Actions.

## Rate Limiting on Public Endpoints

The following public endpoints are protected by an in-memory sliding-window
IP rate limiter (`src/lib/ipRateLimit.ts`) in addition to other guards:

| Route | Limit | Window | Notes |
|---|---|---|---|
| `/api/contact` | 5 requests | 10 minutes | + honeypot field |
| `/api/journalist-applications` | 3 requests | 30 minutes | POST only |
| `/api/page-events` | 120 requests | 10 minutes | Consent-gated analytics only; service-role insert |
| `/api/vitals` | 120 requests | 10 minutes | Critical vitals logged to `app_logs` |
| `/api/portal/cover-art-check` | 30 / user+IP | 10 minutes | `checkDistributedRateLimit` |
| `/api/portal/submit-release` | 20 / user+IP | 10 minutes | distributed (Upstash when configured) |
| `/api/portal/submit-video` | 20 / user+IP | 10 minutes | distributed (Upstash when configured) |

**Website engagement privacy**: `page_events` are recorded only when visitors accept the analytics cookie (`darktunes_consent=accepted`). Session identifiers are hashed server-side (`hashSessionForPageEvents`); no raw IPs are stored. Admin/portal/press/editor routes are excluded from tracking.

**Distributed limits** (`src/lib/rateLimitDistributed.ts`): when `UPSTASH_REDIS_REST_URL` +
`UPSTASH_REDIS_REST_TOKEN` are set, portal submit/cover routes share a fixed window via
Redis (`INCR` + `EXPIRE` only on first hit). Without Upstash, falls back to the in-memory
limiter (per serverless instance). Pair public routes with a Vercel WAF for defense in depth.

## Upload Size Limits (enforced in Route Handlers)

| Route | Max Size |
|---|---|
| `/api/upload` (admin assets) | 50 MB |
| `/api/portal/upload-photo` | 5 MB |
| `/api/portal/upload-release-cover` | 5 MB |
| `/api/portal/upload-asset` | 20 MB |
| `/api/portal/documents/upload` | 20 MB (PDF/DOCX) |
| `/api/admin/sos/import-batches/[id]/upload` | 45 MB (single server proxy) |
| `/api/admin/sos/import-batches/[id]/multipart/part` | 21 MB per chunk (20 MB + overhead) |
| Bronze CSV total (multipart) | 200 MB (`src/lib/sos/bronzeUploadLimits.ts`) |


- Press inquiries from authenticated journalists are stored as internal app log entries; promo track previews/downloads continue to use short-lived signed R2 URLs and journalist download logging.
