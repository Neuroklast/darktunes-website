# Deployment Guide - darkTunes Music Group

## 🚀 Vercel Deployment

### Prerequisites
1. A Vercel account (https://vercel.com)
2. Vercel CLI installed: `npm i -g vercel`

### Steps to Deploy
1. **Connect to Vercel**
   ```bash
   vercel login
   ```

2. **Link Project** (first time only)
   ```bash
   vercel link
   ```

3. **Set Environment Variables** (in Vercel Dashboard)
   - Go to your project settings
   - Navigate to Environment Variables
   - Add all variables from `.env.example`

4. **Deploy**
   ```bash
   # Preview deployment
   vercel
   
   # Production deployment
   vercel --prod
   ```

### Automatic Deployments
- Push to `main` branch for automatic production deployment
- Push to any branch for automatic preview deployment

---

## 🗄️ Supabase Setup

### 1. Create Supabase Project
1. Go to https://supabase.com
2. Create a new project
3. Note your project URL and anon key

### 2. Database Schema

> ⚠️ **The schema script is fully idempotent** — safe to run on a fresh database
> **and** on an existing one with live data. Tables are created with
> `IF NOT EXISTS`; columns with `ADD COLUMN IF NOT EXISTS`; policies and
> triggers are dropped and recreated. **Existing row data is never deleted.**

Copy the entire contents of **`supabase/reset.sql`** from the repository root
and paste it into the **Supabase SQL Editor**, then click **Run**.

The script sets up the complete schema in one shot, including all tables,
indexes, triggers, RLS policies, and default seed data.

### 3. Create First Admin User

> **Note:** The script above contains a backfill at the end that automatically
> syncs every existing `auth.users` row into `public.profiles`.
> You can run the entire script on an already-live database without losing data.

#### Step A — Register the user
Sign up through your app's login page or via the Supabase Dashboard:
**Authentication → Users → Invite user**.

#### Step B — Verify the profile row exists
```sql
SELECT id, email, role
FROM public.profiles
WHERE email = 'your-email@example.com';
```
You should see exactly one row. If not, re-run the full schema script above —
the backfill `INSERT … ON CONFLICT DO NOTHING` at the bottom will add it.

#### Step C — Promote to admin
```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'your-email@example.com'
  LIMIT 1
);
```
> ⚠️ Replace `your-email@example.com` with the actual address.
> `UPDATE 0 rows` means the profile row is still missing — re-run Step B first.

---

## ☁️ Cloudflare R2 Setup

### GoBD / invoice immutability (ops)

Enable **bucket versioning** on the production R2 bucket (or at least for prefixes `invoices/` and `statements/`). The app stores a stable key `invoices/{artistId}/{invoiceId}.pdf` and refuses to overwrite `pdf_url` / `pdf_sha256` once set. Versioning provides an extra recovery trail if objects are replaced outside the app.

### 1. Create R2 Bucket
1. Go to Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Create a new bucket: `darktunes-assets`
4. Enable public access if needed

### 2. Get API Credentials
1. Go to R2 > Manage R2 API Tokens
2. Create API token with read/write permissions
3. Note your Account ID, Access Key ID, and Secret Access Key

### 3. Configure CORS (optional — not required for bronze CSVs)

R2 bucket CORS is **not** configured for `www.darktunes.com` in production. That is intentional: admin bronze distributor CSVs (SOS Accounting) upload and download **only** through same-origin Next.js Route Handlers (`/api/admin/sos/import-batches/...`), including chunked multipart for files \> 45 MB.

Only configure CORS if you explicitly need **browser-direct** PUT/GET to `*.r2.cloudflarestorage.com` (e.g. legacy EPK presigned upload). Example:

```json
[
  {
    "AllowedOrigins": ["https://www.darktunes.com", "https://darktunes.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**Do not** point admin bronze CSV flows at presigned URLs unless this CORS policy is in place.

### 4. File Uploads via Next.js Route Handler

Most uploads are handled server-side at Next.js Route Handlers (`app/api/upload/route.ts` for admin assets, portal routes like `app/api/portal/upload-photo/route.ts`, and SOS bronze CSV routes under `app/api/admin/sos/import-batches/`). This avoids R2 CORS. No Supabase Edge Functions are needed for uploads.

**SOS bronze CSV limits** (see `src/lib/sos/bronzeUploadLimits.ts`): single upload ≤ 45 MB; multipart chunked upload up to 200 MB (20 MB per chunk).

The Route Handler:
1. Verifies the Bearer token and requires an `admin` or `editor` role
2. Parses multipart `FormData` on the server (including optional `folderId` / `artistId` metadata)
3. Computes a SHA-256 hash and short-circuits duplicate uploads to the existing asset record
4. Uploads new files to R2 using the AWS SDK v3
5. Creates the `assets` table row server-side and returns the stored asset metadata plus public CDN URL

---

## 🔐 Environment Variables

Set these in your Vercel project settings (Dashboard → Project → Settings → Environment Variables):

### Supabase (client-side — `NEXT_PUBLIC_` prefix, browser-safe)
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL *(required at build time for Next.js)*
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon/public key *(required at build time for Next.js)*

### Supabase (server-side — never exposed to browser)
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service-role key *(server-side only)*
  - Found at: Supabase Dashboard → Project Settings → API → `service_role` key
  - Used by: `app/api/upload/route.ts` (Next.js Route Handler) to verify Bearer auth tokens before accepting R2 uploads

### Cloudflare R2 (server-side — Next.js Route Handlers only)
- `CLOUDFLARE_R2_ACCOUNT_ID`: Your Cloudflare account ID
- `CLOUDFLARE_R2_ACCESS_KEY_ID`: R2 API token access key ID
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`: R2 API token secret access key
- `CLOUDFLARE_R2_BUCKET_NAME`: R2 bucket name (e.g. `darktunes-assets`)
- `CLOUDFLARE_R2_PUBLIC_URL`: R2 public CDN base URL (e.g. `https://cdn.darktunes.com`)

### API Credentials Encryption (required)
- `API_CREDENTIALS_ENCRYPTION_KEY`: 64-character hex string (32 bytes). Generate with `openssl rand -hex 32`. Encrypts external integration keys before they are stored in Supabase `api_credentials`. **Never** store this key in Supabase or commit it to git.

External integration API keys (Spotify, Discogs, Resend, YouTube, MailerLite, etc.) are **not** Vercel env vars anymore. Configure them in **Admin → API Keys** (`/admin/api-keys`). Values are encrypted with AES-256-GCM and persisted in `api_credentials` (admin-only RLS). iTunes and Odesli sync work without keys.

**Migrating from env vars:** After deploying, log in as admin → API Keys → **Import from environment variables** (one-time). Then remove the legacy `SPOTIFY_*`, `DISCOGS_*`, `RESEND_*`, etc. from Vercel.

### Contact Form (optional — email delivery)
- `CONTACT_EMAIL`: The email address that receives contact form submissions from `POST /api/contact`. Defaults to `info@darktunes.com` if not set. Use a monitored inbox.

### Cron & infra secrets (optional — remain in Vercel env)
- `CRON_SECRET`: Shared secret for cron and external trigger calls. Accepted by `/api/sync`, `/api/sync/queue`, `/api/sync-youtube`, and `/api/sync-api`. Also required by the `trigger-sync` Supabase Edge Function (see below).
- `NEXT_PUBLIC_SITE_URL`: Public site URL without trailing slash (e.g. `https://darktunes.com`).
- `LABEL_NOTIFICATION_EMAIL`: Label inbox for portal submission and health-alert emails. Leave blank to disable.
- `HEALTH_ALERT_WEBHOOK_URL`: Configure in Admin → API Keys (encrypted in DB), not env.

### Web Push / PWA notifications (optional — one-time deploy setup)
Artists and admins only tap **Enable** in the portal/admin UI. Operators set VAPID keys once:

```bash
npx web-push generate-vapid-keys
```

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Public key (browser + SW)
- `VAPID_PRIVATE_KEY`: Private key (**server only**, never commit)
- `VAPID_SUBJECT` (optional): `mailto:label@your-domain.com` or site URL

After setting keys on Vercel, re-run **`supabase/reset.sql`** (or at least the `push_subscriptions` + `notification_preferences.push` sections) so the table and `push` preference column exist. Without keys, in-app + email still work; push is a silent no-op.

### Newsletter Double Opt-In
- **Next.js routes** (contact form, portal notifications): Resend credentials from Admin → API Keys.
- **Supabase Edge Function** `newsletter-confirm`: still uses Supabase Edge Function secrets (see below) until migrated.

### Newsletter — MailerLite sync (optional)
Configure `mailerlite_api_key` and `mailerlite_group_id` in Admin → API Keys. Called from `GET /api/newsletter/verify` after DOI confirmation.

### ISR Webhook Revalidation (optional — Supabase-triggered cache busting)
- `REVALIDATE_SECRET`: A random, high-entropy ****** checked by `POST /api/revalidate`. Required when you configure Supabase webhooks to call this endpoint after DB writes so the ISR cache is busted automatically. Generate with `openssl rand -hex 32`. Share this value with the Supabase webhook configuration (Authorization header value).

### Supabase Read Replica (optional — Supabase Pro plan)
- `SUPABASE_REPLICA_URL`: Connection URL for a Supabase read replica (configure via Supabase Dashboard → Database → Replicas). When set, heavy analytics queries (portal analytics charts, admin health/logs dashboard, SOS CSV exports) are routed here to reduce load on the primary DB. Falls back silently to the primary DB when unset — safe for development and Starter plan deployments.
- `SUPABASE_REPLICA_ANON_KEY`: Anon key for the read replica. Must be set alongside `SUPABASE_REPLICA_URL`.

> ⚠️ **Important for Next.js:** `NEXT_PUBLIC_*` variables must be set in the Vercel project settings for **both** the Production and Preview environments before the first build. Next.js embeds these at compile time. Missing variables will cause the Supabase client to fall back to a placeholder and Supabase features will be disabled at runtime.

---

## 📝 Post-Deployment Checklist

- [ ] Supabase project created and configured
- [ ] Database schema applied: copy `supabase/reset.sql` into Supabase SQL Editor and run
- [ ] First admin user registered **after** schema was applied
- [ ] Admin role confirmed via `SELECT role FROM public.profiles WHERE email = '...'`
- [ ] Artist users registered and linked: `UPDATE artists SET user_id = (SELECT id FROM auth.users WHERE email = 'artist@...') WHERE slug = 'my-artist'`
- [ ] R2 bucket created and configured
- [ ] Environment variables set in Vercel
- [ ] Domain configured in Vercel
- [ ] SSL certificate active
- [ ] Test admin login
- [ ] Test artist portal login at `/portal`
- [ ] Test portal billing profile save at `/portal/billing`
- [ ] Test SOS statement approval in `/admin` and invoice creation from `/portal/statements`
- [ ] Test file upload
- [ ] Test artist "Sync Now" button (iTunes releases import)
- [ ] Check sync_logs table for any errors
- [ ] Test iTunes sync
- [ ] Verify all sections load correctly

---

## 🧩 Supabase Edge Function Deployment

The newsletter DOI confirmation email is sent by a Supabase Edge Function (Deno runtime).
This function MUST be deployed separately from the Next.js app — it does NOT deploy
automatically with Vercel.

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Log in to Supabase CLI
supabase login

# Deploy the Edge Function
supabase functions deploy newsletter-confirm --project-ref <your-project-ref>
```

> Your project ref is in the Supabase Dashboard URL: `https://app.supabase.com/project/<project-ref>`

### Edge Function Secrets (Supabase — separate from Vercel)

These secrets power the Deno runtime inside Supabase Edge Functions. They are
**completely separate from Vercel environment variables** — setting them in Vercel
does NOT make them available to Edge Functions.

Set these in **Supabase Dashboard → Project → Edge Functions → Secrets**:
- `RESEND_API_KEY` — Resend API key (can match Admin → API Keys value)
- `RESEND_FROM_EMAIL` — verified sender address
- `NEXT_PUBLIC_SITE_URL` — your production URL (e.g. `https://darktunes.com`)

Without these secrets, the `newsletter-confirm` Edge Function will fail silently
and DOI confirmation emails will never be delivered.

### `trigger-sync` Edge Function (API Sync Trigger)

The `trigger-sync` Edge Function lets all data sync operations be triggered from
Supabase (scheduled Supabase Cron, Database Webhooks, or manual HTTP calls)
**independently of Vercel Cron Jobs**.

```bash
# Deploy the trigger-sync Edge Function
supabase functions deploy trigger-sync --project-ref <your-project-ref>
```

Set these in **Supabase Dashboard → Project → Edge Functions → Secrets**:
- `SITE_URL` — your production Next.js URL (e.g. `https://darktunes.com`)
- `CRON_SECRET` — same value as your Vercel `CRON_SECRET` env var

#### Supported sync types

| `type` value  | Next.js route called   | What it does                          |
|---------------|------------------------|---------------------------------------|
| `all`         | `POST /api/sync`       | Enqueue full sync for all artists     |
| `youtube`     | `POST /api/sync-youtube` | Sync YouTube channel videos         |
| `itunes`      | `POST /api/sync-api`   | Sync iTunes releases for all artists  |
| `spotify`     | `POST /api/sync-api`   | Sync Spotify releases                 |
| `discogs`     | `POST /api/sync-api`   | Sync Discogs releases                 |
| `songkick`    | `POST /api/sync-api`   | Sync Songkick concert dates           |
| `bandsintown` | `POST /api/sync-api`   | Sync Bandsintown concerts (per-artist key) |
| `odesli`      | `POST /api/sync-api`   | Resolve Odesli smart links            |

#### Usage examples

**Manual HTTP call:**
```bash
curl -X POST \
  'https://<project>.supabase.co/functions/v1/trigger-sync?type=bandsintown' \
  -H 'Authorization: ****** <SUPABASE_ANON_KEY>'
```

**Supabase Cron (Dashboard → Database → Cron Jobs):**
```
Path:     /trigger-sync?type=all
Schedule: 0 3 * * *   # daily at 03:00 UTC
```

**Supabase Database Webhook (triggers after specific DB events):**
```
URL:     https://<project>.supabase.co/functions/v1/trigger-sync
Method:  POST
Headers: Authorization: ****** <SUPABASE_ANON_KEY>
Body:    { "type": "bandsintown" }
```

> **Bandsintown sync note:** The `bandsintown` sync type iterates through every
> artist in the database that has **both** `bandsintown_id` **and** `bandsintown_api_key`
> (per-artist field) set. Artists missing either field are silently skipped.
> A global `bandsintown_api_key` in Admin → API Keys is optional fallback when
> per-artist `bandsintown_api_key` is unset. Artists without `bandsintown_id` are skipped.

---

## 👤 Creating the First Journalist Account

1. Have the journalist sign up at `/press/login` (or invite them via Supabase Dashboard → Authentication → Users → Invite user).
2. In the Admin Panel → **Users** tab, find the user row.
3. Change their role from `user` to `journalist`.
4. The journalist can now log in at `/press/login` and access `/press/dashboard/*`.

---

## ✅ Supabase Cron Validation (sync scheduling)

Sync is scheduled via **Supabase Cron** calling the `trigger-sync` Edge Function (not Vercel Cron). After deployment, configure in Supabase Dashboard → **Integrations → Cron** (or Database → Cron Jobs):

| Schedule | `trigger-sync` type | Action |
|----------|---------------------|--------|
| `0 3 * * *` | `all` | Enqueue full artist sync |
| `*/5 * * * *` | `process-queue` | Process `sync_queue` jobs |
| `0 6 * * *` | `youtube` | YouTube channel sync |

Optional daily: `requeue-failed` → `POST /api/sync/requeue`.

Before applying `releases_spotify_id_key` / `releases_discogs_id_key` UNIQUE constraints from `reset.sql`, dedupe existing rows:

```sql
SELECT spotify_id, COUNT(*) FROM releases WHERE spotify_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
SELECT discogs_id, COUNT(*) FROM releases WHERE discogs_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
```

If a sync fails: Admin → **System** → Error Log → filter by `api_source`.

---

## 🛠️ Maintenance

### Database Backups
Supabase provides automatic daily backups. Additional backups can be configured in project settings.

### Monitoring
- Check Vercel Analytics for performance metrics
- Monitor Supabase dashboard for database health
- Review R2 usage in Cloudflare dashboard

### Updates
```bash
# Update dependencies
npm update

# Deploy updates
vercel --prod
```


- No additional environment variables are required for the press portal expansion; existing Supabase/R2/Resend variables continue to power press logins, secure asset delivery, and optional email workflows.

---

## 🎫 Zammad Support Integration (optional)

Admin → **Support** lets label admins submit manual tickets and reviews automatic
system-error reports. Tickets are sent to [Zammad](https://docs.zammad.org/en/latest/)
via REST API in the background. **If Zammad is not configured or unreachable, the
app continues to work normally** — submissions are logged locally in
`zammad_ticket_log` with status `blocked_unconfigured` or `failed`.

### Environment variables (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `ZAMMAD_URL` | Yes (to send) | Base URL of your Zammad instance, e.g. `https://support.example.com` |
| `ZAMMAD_API_TOKEN` | Yes (to send) | Agent API token (`Authorization: Token token=…`) |
| `ZAMMAD_GROUP` | No | Target group name (default: `Support`) |

Create the token in Zammad → **Profile → Token Access** with `ticket.agent` permission.

### Behaviour

- **Manual tickets:** Admin → Support → New Ticket (attributed to the admin's email/name).
- **Auto error tickets:** Client errors reported via `POST /api/log-error` (level `error`)
  create background tickets with `[SYSTEM ERROR REPORT — darkTunes]` prefix.
- **Deduplication:** Same error fingerprint + user within 24 h → no duplicate Zammad ticket.
- **Known errors:** Admin can block fingerprints in Support → Known Errors.
