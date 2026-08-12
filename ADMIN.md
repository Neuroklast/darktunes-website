# darkTunes Admin Panel & Artist Portal

## Admin Panel

Access the admin panel at `/admin`. Authentication is enforced at the edge by **Next.js Middleware** (`middleware.ts`) — unauthenticated requests are redirected to `/admin/login` before any page content is served.

## Artist Portal

Access the artist portal at `/portal`. Artists sign in with their own Supabase Auth account. The same Edge Middleware enforces auth: unauthenticated requests are redirected to `/portal/login`.

Portal features:
- **EPK Profile Editor** (`/portal/profile`) — artists edit bio, genres, social links, press quote, and upload a profile photo. The photo upload goes server-side via `/api/portal/upload-photo` (no CORS issues).
- **EPK PDF Export** (`/portal/profile`) — artists can generate a print-ready EPK via `@react-pdf/renderer` (see `EPKPdfDocument.tsx` + `epkPdfRenderer.tsx`) so the downloaded PDF mirrors the configured profile content, layout, and links.
- **Enterprise Analytics** (`/portal/analytics`) — artists view streaming stats, listener trends, territory revenue, release performance, revenue mix, concert/promo impact, EPK & press downloads, settlement ledger (when `artist.statements` is enabled), website engagement (`page_events`, consent-gated), and merch orders (`merch_orders` from SOS persist). Overview dashboard shows actionable intelligence cards with deep links. Feature-flag: `artist.analytics`.
- **Royalty Statements** (`/portal/statements`) — artists download their royalty PDFs via short-lived (5 min) presigned R2 URLs. Approved statements surface a **“Rechnung erstellen”** CTA that deep-links into the invoice flow for that exact statement.
- **Billing Profile** (`/portal/billing`) — artists manage legal invoice master data (`artist_billing_profiles`): legal name, address, Steuernummer / USt-IdNr., **tax status** (`standard` | `small_business` | `reverse_charge`), and payout details. EU VAT IDs are checked via official **VIES** on save; reverse charge requires a live-valid VIES result. IBANs are validated **locally only** (ISO 7064 — never third-party bank APIs). Invoice creation is blocked until the profile is complete.
- **Invoices** (`/portal/invoices`) — artists create invoices manually, via the free PDF generator tab, or directly from an approved Statement of Sales. Incomplete billing profiles are collected inline (`InlineBillingProfileStep`) before any invoice or PDF is generated. SOS-linked invoices lock the approved amount, store the artist’s own bookkeeping number, and generate a dark-themed §14 UStG-ready PDF (Kleinunternehmer / reverse-charge notices, optional ECB FX footnote for non-EUR). Issued PDFs are write-once (`pdf_sha256`). Label recipient data comes from site settings (not hardcoded).
- **Tour Manager** (`/portal/tour`) — artists can create/delete their own concert entries (announced/confirmed/cancelled).
- **Release Submission** (`/portal/releases/new`) — artists submit metadata for admin review into `release_submissions` (not the public catalog). Admins can click **Create draft release** to insert a hidden `releases` row (`is_visible=false`, sync-protected until street date), then edit under Releases.
- **Marketing Assets** (`/portal/marketing`) — artists can review the label-managed Promo Log timeline, download assigned assets via short-lived presigned URLs, and upload/delete their own assets via `/api/portal/upload-asset`.
- **Label Inbox** (`/portal/messages`) — artists can read rich-text label messages, receive realtime inbox updates, mark messages as read, and send rich-text replies (stored in `artist_replies`).
- **Account Settings** (`/portal/settings`) — artists can update their password and switch locale (EN/DE).
- **Feature-flag gating** — portal modules are controlled by `portal_feature_flags` (artist.* keys) and hidden/blocked when disabled.

To link an artist to a portal user, use the **Users** tab in the Admin Dashboard:
1. Open `/admin` and go to the **Users** tab (admin-only).
2. Find the user row and click the **Link Band** icon (🔗).
3. Select the artist from the dropdown and confirm.

Alternatively, you can still run SQL directly:
```sql
UPDATE public.artists
SET user_id = (SELECT id FROM auth.users WHERE email = 'artist@email.com')
WHERE slug = 'artist-slug';
```

## Admin Features

- **User Authentication**: Secure login/logout via Supabase Auth + `@supabase/ssr` cookie-based sessions
- **Role-Based Access Control**: Admin and Editor roles with different permissions
- **User Management** *(admin-only)*: View all registered users, change their roles (admin / editor / journalist / user), ban/unban accounts, delete users, and link/unlink artists — no raw SQL required. Accessible via `/admin/users` (only visible to admins).
- **Artists Management**: Create, read, update, and delete artist profiles. The artist form includes social/shop URL fields (**Facebook**, **Twitter/X**, **TikTok**, **Bandcamp**, **Shop URL**), an **Assets** tab, and image/logo **Asset Picker** buttons. Editing an existing artist navigates to the dedicated `/admin/artists/[id]/edit` route. Creating a new artist opens a dialog on `/admin/artists`.
- **Releases Management**: Manage music releases with iTunes API integration, Odesli smart-link resolution, and promo-flag control.
- **News Management**: Create and publish news posts and announcements. Optionally associate a news post with a specific artist (`news_posts.artist_id`). Toggle **Press-only** visibility (`is_press_only`).
- **Feature Flags** *(admin-only)*: Toggle Artist + Journalist dashboard modules (`portal_feature_flags` table, API: `PATCH /api/admin/feature-flags/[id]`). Also toggle global `site_settings` feature flags via **FeatureTogglesManager**.
- **Messages** *(admin-only)*: Rich-text label inbox (`label_messages`) at `/admin/messages`. Conversations group `Re:`/`Aw:` rows into one list entry (chat detail, sort, drag-to-folder, optional arrival sound). Also: templates, search, starring, realtime, soft-delete.
- **Promo Log**: `/admin/promo-log` — admins and editors create, review, and delete artist-specific marketing activity entries. Artists see these read-only in `/portal/marketing`.
- **Accreditations** *(admin-only)*: `/admin/accreditations` — review and approve/reject journalist accreditation requests (`accreditation_requests`).
- **Release Submissions**: `/admin/release-submissions` — review/approve/reject submissions; **Create draft release** builds a hidden catalog entry from submission data (optional, not automatic on accept).
- **Video Submissions**: `/admin/video-submissions` — review and approve/reject video submissions from artists (submitted via `/portal/releases/videos/new`).
- **Artist Feedback**: `/admin/feedback` — product feedback from the portal (`/portal/feedback`). Filter by status (new / reviewed / archived) and category; open detail to mark reviewed or archive. Nav badge counts `new` items. Not the same as **Support** (Zammad).
- **Accounting** *(admin-only)*: `/admin/accounting` — **Guided** workflow (Upload → Review → Publish) by default, with **Advanced** mode for all tools. Includes SOS CSV processing, **Abrechnungszentrale** (settlement register, corrections, payments, period lock/archive), **Bronze CSV Archives** (server-proxy upload/download — no browser presigned R2), **Save to Portal** (territory metrics, merch orders, period summaries, event/promo impact), statement approval workflow, external listener sync (Last.fm/Soundcharts), and **Spotify public stats (Apify)** dry-run/sync (token under **API Keys → Apify**, not Vercel env).
- **Label Analytics** *(admin-only)*: `/admin/analytics` — **Label Intelligence Hub**: roster health matrix, saved period revenue trends, press download CRM, website engagement rollup, and financial audit trail (`financial_audit_events`).
- **System** *(admin-only)*: `/admin/system` — Health dashboard (queue stats, DB connectivity), Audit Log (`sync_logs`), Error Log (failed sync runs), App Errors (`app_logs`), and Maintenance tasks (clear logs, purge orphaned releases, reset checklists, manage accreditations, clear stats). Supports full-text search, source/status filters, and pagination.
- **Logs** included in System tab: Audit Log (all `sync_logs` entries), Error Log (failed/partial), App Errors (`app_logs`).
- **Statement Approval Workflow**: Statements tab (within Accounting) shows workflow status (`draft`, `label_approved`, `artist_notified`, `acknowledged`) and lets admins/editors approve draft statements with optional internal notes before artists generate linked invoices.
- **Roles & Permissions** *(admin-only)*: Configure per-role content permissions (`can_publish_news`, `can_edit_news`, `can_manage_artists`, `can_manage_releases`, `can_manage_videos`, `can_view_admin_panel`) stored in `role_permissions`. Also supports **Custom Roles** via `/api/admin/roles/custom` and **Permission Definitions** via `/api/admin/roles/permissions-def`. Changes are enforced at API, RLS, and frontend layers.
- **Videos Management**: Manage music videos and YouTube content.
- **Assets Management**: Folder-based File Explorer / Asset Manager for Cloudflare R2 uploads (single source of truth for all media), with search, bulk selection/delete, folder CRUD, artist assignment, press metadata, bulk press approve/kit actions, inline previews, and duplicate detection via SHA-256 hash.
- **Press Kit** (`/admin/press`): `PressKitBuilder` curates `press_kit_items` per artist or label-wide; uploads happen in the Asset Explorer, not in a separate media library.
- **Site Settings**: Configure all global site content (social links, SEO metadata, hero text, etc.) without code changes.
- **Visual Effects**: Configure the dark-industrial overlay effects (noise/grain opacity, CRT scanlines toggle, vignette intensity) from the **Admin → Color Theme** page (Effects tab) — changes go live immediately via ISR cache revalidation.
- **Legal / DSGVO**: Configure Impressum (§ 5 DDG fields: company name, legal form, representative, VAT-ID, register court, etc.), Datenschutzerklärung (DE/EN), **portal AGB** (DE/EN templates with `{{placeholders}}`), AGB version (`portal_terms_version`), and structured **label billing address** for invoice PDFs from the admin panel's "Legal / DSGVO" tab. Public pages: `/impressum`, `/datenschutz`, `/agb`. Also configure the R2 placeholder image shown to users before they consent to external media.

## Setup

### 1. Configure Supabase

Follow the instructions in `DEPLOYMENT.md` to:
- Create a Supabase project
- Set up the database schema
- Configure environment variables

### 2. Create First Admin User

After signing up through the app at `/admin/login`, run this SQL in Supabase:

```sql
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### 3. Access Admin Panel

Navigate to `/admin`. If not authenticated, you will be redirected to `/admin/login` by the Edge Middleware. Log in, and the middleware will redirect you back to `/admin`.

## Usage

### Artists
- Add new artists with their bio, genres, social links, and **external API IDs** (Spotify, Discogs, Songkick)
- Update artist information
- Mark artists as featured
- **"Sync Now"** button per artist — triggers `POST /api/sync/artist` to fetch the latest iTunes releases, cache cover art in Cloudflare R2, and upsert releases to Supabase. The button shows a spinner while syncing; success/error is reported via toast notification.
- Skeleton loading states — the artist table shows animated placeholder rows (avatar + text skeletons) while data is fetching, preventing layout shift.
- View "Last Synced" date for each artist
- Delete artists (cascades to their releases)

### Releases
- Manually add releases or sync from iTunes API
- Edit release metadata (title, date, type, cover art)
- Add streaming links (Spotify, Apple Music, YouTube)
- Feature releases on the homepage

### News
- Create news posts with markdown support
- Add featured images
- Schedule or publish immediately
- Edit or delete existing posts
- Toggle **Press-only** visibility (`is_press_only`) for journalist dashboard content
- Optionally associate a news post with a specific **artist** — that post then appears on the artist's public profile page in addition to the main news feed

### Journalist Dashboard
- Login at `/press/login`
- Protected dashboard at `/press/dashboard/*` for roles `journalist` and `admin`
- Feature-flagged modules: Promo Pool, Press Kit, Press Releases, Accreditation, Download History
- Downloads are tracked in `journalist_downloads`

### Videos
- Add music videos by YouTube ID
- Organize video gallery
- Set thumbnails and metadata
- Trigger `POST /api/sync-youtube` to import the latest label-channel videos; synced rows are auto-linked to visible artists via title matching (`videos.artist_id`) and default to `is_visible=true`, so public sections and artist profile pages render them immediately.

### Assets
- Upload images and media files to Cloudflare R2 through the secure Next.js Route Handler `app/api/upload/route.ts` — credentials never reach the browser
- Organize files into nested folders (`asset_folders`) and optionally assign assets to an artist
- Search globally, switch between grid/list views, multi-select files, and bulk-delete from the explorer
- Duplicate uploads are detected server-side via SHA-256 and return the existing asset instead of storing a second copy
- Browse uploaded assets with inline previews/audio playback and copy public URLs for use in content
- Delete assets or folder subtrees — R2 objects are deleted before their database rows are removed
- Reuse uploaded image/logo assets directly inside the Artist form via the built-in `AssetPicker`
- Set press metadata on assets (category, caption, alt text, approval) and bulk-approve or add selected assets to a press kit via toolbar actions
- Artist portal uploads can flag assets as "suggest for press kit review" (`press_suggested`) — admins see these in the explorer for curation

### Site Settings
Manage all global site content from the **Settings** tab — no code changes needed:
- **Global**: Label name, tagline, contact email, privacy policy URL, terms URL
- **Social Links**: Instagram, YouTube, Spotify profile URLs (leave blank to hide the icon)
- **Homepage**: Spotify playlist URI and multi-playlist entries (label + URI) for instant tab-based player swaps on the homepage
- **Artist profile (`/artists/[slug]`)**: **Artist profile video rows** and **Artist profile news rows** — how many grid rows to show before the in-place “Show all” button (default **2** each). Visible tiles = rows × responsive columns (videos: 1 / md 2 / xl 3; news: 1 / md 2). Does **not** apply to the Personal Artist Page.
- **Hero Section**: Fallback background image, badge text, and descriptions used when featured releases or news posts lack data
- **SEO / Meta**: Page title, meta description, Open Graph title and description

Changes are saved to the `site_settings` Supabase table. The Admin CMS immediately calls `POST /api/revalidate-site-settings` to bust the Next.js ISR cache so the public site reflects the update within seconds.

## Permissions

The permission system is database-backed via the `role_permissions` table in PostgreSQL. Each role has a row with boolean columns for every permission. Permissions are enforced at three levels: backend API routes, PostgreSQL RLS policies, and the frontend UI.

### Available Permissions

| Permission | Controls |
|---|---|
| `can_publish_news` | Creating new news posts (INSERT) |
| `can_edit_news` | Editing existing news posts (UPDATE) |
| `can_manage_artists` | Creating and editing artist profiles |
| `can_manage_releases` | Creating and editing releases |
| `can_manage_videos` | Creating and editing videos |
| `can_view_admin_panel` | Accessing the Asset Explorer and the admin panel |

### Default Role Permissions

| Role | publish news | edit news | manage artists | manage releases | manage videos | view admin |
|---|---|---|---|---|---|---|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **editor** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **journalist** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **artist** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **user** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Important Notes

- The **admin** role always has full access and **cannot be restricted** — all RLS policies include an `OR get_my_role() = 'admin'` bypass.
- Permission changes take effect **immediately** without requiring users to log out and back in.
- To modify permissions for a role, use the **Roles & Permissions** tab in the admin panel (admin-only), which writes directly to the `role_permissions` table.
- The `role_permissions` table is defined in `supabase/reset.sql` (the single source of truth for the schema).

## Development

To run the admin panel locally with Supabase:

1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase and R2 credentials
3. Run `npm run dev` — Next.js dev server starts on `http://localhost:3000`
4. Navigate to `http://localhost:3000/admin`

- **Artist Auto-Sync**: A "Sync Now" button appears next to each artist. Clicking it calls `POST /api/sync/artist`, which fetches releases from the iTunes API, downloads cover art and stores it in Cloudflare R2, and upserts releases to Supabase. All sync operations are logged in the `sync_logs` table for audit purposes.
- **Skeleton Loading**: The Artists table shows skeleton placeholder rows (avatar circle + text lines) while data is loading, avoiding cumulative layout shift (CLS).

## Integration Notes

The admin panel is an integrated part of the Next.js App Router — it lives at the `/admin` route segment. All data is stored in Supabase and shared between the public site and admin panel.

Admin pages are always dynamically rendered (`force-dynamic`) so auth cookies are always checked server-side on every request.


- Press Portal tab: review journalist applications, curate press kits via `PressKitBuilder`, manage promo tracks with genre/BPM/key/NDA metadata, review accreditations, and monitor portal analytics.

## Press Portal (Admin)

The Press Portal admin features are in the Admin Dashboard under the **Press** tab
(admin-only). This tab provides:
- **Press Kit Builder**: Curate `press_kit_items` per artist or label-wide — uploads and press metadata (category, caption, alt text, approval) happen in the **Assets** tab (Asset Explorer), not in a separate media library
- **Promo Tracks**: Manage promo audio with metadata (genre, BPM, key, NDA required flag)
- **Journalist Applications**: Review and approve/reject journalist accreditation requests
- **Accreditations**: Grant/revoke journalist portal access

## Statements (Admin-only — Accounting tab)

`StatementsManager` is a read-only table in `/admin/accounting` (Statement History tab) listing all `sales_statements` rows across all artists. Admins and editors can verify which royalty PDFs have been uploaded.

The **SOS Generator** tab in the same Accounting page lets admins upload royalty PDFs directly from the admin panel. The upload flow runs as a `"use server"` Next.js Server Action (`app/portal/statements/_actions/uploadStatement.ts`) that:
1. Verifies the caller's admin/editor session via cookie-based Supabase auth.
2. Generates a presigned R2 PUT URL and uploads the PDF from the browser directly to R2.
3. Inserts the `sales_statements` row with the service-role client to bypass RLS.
4. Sends an email notification to the artist via Resend (non-blocking, silently skipped when Resend is not configured in Admin → API Keys).

**Do NOT** use a webhook or external HTTP POST to upload statements — the Server Action is the only supported upload path.

## Monitoring Sync (label admin)

Label admins do **not** configure hosting, R2, Vercel, Supabase Cron, Edge Functions, or secrets from the dashboard. That stays in operator docs (`DEPLOYMENT.md`).

From **Admin → System → Health** the label admin can:
1. See product health (APIs, queue KPIs, plain-language issues) without infra setup copy
2. Run **Force Sync All** / **Sync YouTube** when credentials exist under API Keys
3. Use **Advanced** for live `sync_queue` jobs — cancel pending/running (cooperative), retry failed/cancelled
4. Open **Log Manager** for application/API error browsing

Scheduler and secret setup: operators only — Supabase Dashboard + `DEPLOYMENT.md` (not the admin UI).

## Creating a Journalist Account

1. Have the journalist sign up at `/press/login` (or create via Supabase Dashboard → Auth)
2. Admin → **Users** tab → find the user row
3. Change role to `journalist`
4. The journalist can now access `/press/dashboard/*`

## Color Theme (CI Color System)

The **Color Theme** page (**Admin → Color Theme**) lets you override the darkTunes brand colors at runtime — no code deployment required.

### How It Works

Colors are stored in `site_settings` (`theme_primary`, `theme_secondary`, `theme_background`, `theme_card`, `theme_border`, `theme_foreground`). At render time, `ThemeStyleInjector` (a React Server Component in `app/layout.tsx`) reads these values and emits an inline `<style>` block that overrides the following CSS custom properties **server-side** (no FOUC):

| CSS custom property | Default | Controls |
|---|---|---|
| `--primary` / `--accent` / `--ring` | `#493687` | Primary CTAs, active nav, focus rings |
| `--secondary` | `#7e1e37` | Secondary buttons, hover effects, promo badges |
| `--background` | `#101010` | Global page background |
| `--card` / `--muted` / `--popover` | `#292929` | Cards, modals, dropdowns |
| `--border` / `--input` | `#383838` | Borders, input frames |
| `--foreground` | `#ffffff` | Primary text |

### Live Preview (Admin Editor)

`ColorThemeManager` uses a **declarative live-preview** approach:

1. All mutable theme state is held in a single `useReducer` (`ThemeDraft`) — no individual `useState` per field.
2. A `buildPreviewCss(draft)` helper converts the current draft into a `:root { … }` CSS string.
3. That string is rendered as `<style data-id="ctm-live-preview">` — a plain JSX sibling element. React mounts/unmounts it automatically; no imperative `document.documentElement.style.setProperty` calls are needed, and there are no hydration or render-desync risks.
4. On **Save**, the draft is diffed against the original and only changed fields are written to `site_settings`. The `handleCancel` path restores the original draft in one `dispatch` call.

### Behavior

- If a theme field is left **empty**, the CSS falls back to the brand defaults defined in `app/globals.css` — no override is applied.
- Changes take effect on the **next page request** (ISR revalidation is triggered automatically on save).
- The `ThemeStyleInjector` never introduces a flash-of-unstyled-content (FOUC) because the style is injected server-side before the browser renders the page.
- The default darkTunes CI palette is always safe to use without any overrides.

> **⚠️ WCAG contrast requirement**: Any color override must maintain ≥ 4.5:1 contrast for normal text and ≥ 3:1 for large text (WCAG 1.4.3 AA). Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) before saving non-default colors.

## Manual ISR Cache Invalidation

If a public page shows stale data after an admin save:
- Admin → Settings → any save triggers automatic revalidation of site-settings cache
- To manually bust artist/release caches: use the "Force Sync All" button in Admin → Health tab
- Or call: `POST /api/revalidate` with `Authorization: ******
