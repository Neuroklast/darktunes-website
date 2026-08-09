# Multi-tenant SaaS (organizations)

SSOT for label-level multi-tenancy. Artist portal membership (`artist_members`) stays a **nested** tenancy inside one organization.

**Program branch:** `feat/multi-tenant-saas` (all phase work on this branch).  
**Prior art:** [PR #417](https://github.com/Neuroklast/darktunes-website/pull/417) — port modules; do not merge that PR wholesale (far behind `main`).  
**User-facing copy:** draft with the humanizer skill (plain language, no promo fluff).

## Vocabulary

| Term | Meaning |
|------|---------|
| Organization | One label customer (tenant). Table `organizations`. |
| Org #0 / default | darkTunes. `DEFAULT_ORGANIZATION_ID` + slug `darktunes`. |
| `organization_id` | FK on business rows. Never trust client body alone for authz. |
| Surface | `marketing` \| `platform` \| `tenant` (host class). |
| Platform | SaaS marketing, checkout, owner onboarding, super-admin ops. |
| Tenant host | Label public site + `/admin` + `/portal` + press for that org. |

Prefer `organization` / `organization_id` in code. Older plan text saying “tenant” means organization.

## Host map

| Host | Surface | Org |
|------|---------|-----|
| `darktunes.com`, `www.darktunes.com` | tenant | Org #0 |
| `{slug}.{PLATFORM_ROOT_DOMAIN}` | tenant | resolved by slug |
| Custom domain (verified) | tenant | `custom_domains` lookup |
| Marketing hosts (`MARKETING_HOSTS`) | marketing | none (platform product) |
| Localhost / unset | tenant | Org #0 (dev default) |

Resolution order (target):

1. Explicit trusted header only if set by `proxy.ts` after resolution (never from the browser).
2. Verified custom domain.
3. Subdomain slug on platform root domain.
4. Apex darkTunes hosts → Org #0.
5. Unknown host → controlled 404 / redirect to marketing (once pilots enabled).

## Runtime rules

- `proxy.ts` sets `x-organization-id`, `x-organization-slug`, `x-surface` after host resolve.
- Server code: `getRequestOrganizationId()` / `requireOrganizationId()` — see `src/lib/organizations/`.
- DAL: tenant-owned queries take `organizationId` (explicit) and filter/write that column.
- Cache / ISR tags: prefix `o:${organizationId}:…` (no cross-org cache).
- R2 keys (target): `tenants/{organizationId}/…` with dual-read for Org #0 legacy keys during migration.
- Service-role routes still pass `organizationId` into DAL (defense in depth).

## Schema rules

- Only `supabase/reset.sql` + `src/types/database.ts`.
- Additive + idempotent DDL only.
- New org tables (from PR #417 baseline): `organizations`, `organization_users`, `organization_branding`, `plans`, `plan_features`, `subscriptions`, `organization_features`, `custom_domains`, `organization_audit_log`, partner API tables as needed.
- Expand `organization_id` beyond the PR’s CMS subset to **all** business tables over time (batches).
- Align `api_credentials.label_id` with `DEFAULT_ORGANIZATION_ID`.

## AuthZ

```
auth.users
  ├─ platform / super-admin (ops across orgs)
  └─ organization_users (owner|admin|editor|member per org)
       └─ artist_members (artists inside that org)
```

Legacy `profiles.role` admin/editor maps to Org #0 membership during backfill.

## Billing (Stripe)

- Label pays the platform (Stripe Billing). Not Connect for fan payments.
- Checkout + webhook patterns: port from PR #417 `app/api/stripe/*`.
- **Existing-org checkout** (`POST /api/stripe/checkout`): authenticated caller + `assertBillingOrganizationAccess` (platform_admin or `organization_users` row). No Org #0 free-pass — unlike staff CMS transitional access.
- **New-label signup** (`POST /api/onboarding/register`): creates org (status `pending`) then optional Checkout session; no prior membership required.
- Webhook handlers must be idempotent (`stripe_webhook_events` dedupe).
- Plan slugs (PR #417): `starter` | `professional` | `business`.
- Enforce limits server-side (`organizationHasFeature` / entitlements), not UI-only.
- Manual E2E: test keys → register or member checkout → `checkout.session.completed` → subscription row + plan features + org `active`.

## Zero downtime for darkTunes

1. Expand schema with default `organization_id` = Org #0.
2. Backfill existing rows.
3. Deploy host resolution so darkTunes apex → Org #0 (behavior unchanged).
4. Platform marketing on a **separate** host.
5. Pilot orgs on subdomains behind flag if needed.
6. Contract dual-read paths later.

Never take `darktunes.com` offline for SaaS launch.

## Phase checklist (summary)

| Phase | Focus | Status on `feat/multi-tenant-saas` |
|-------|--------|-------------------------------------|
| 0 | Docs, constants, env placeholders | Done |
| 1 | Schema + Org #0 seed | Done (apply `reset.sql` on staging/prod) |
| 2 | Host context in `proxy.ts` | Done — DB slug/custom-domain lookup; suspended gate; `MULTI_TENANT_STRICT_HOSTS` |
| 3 | DAL/API `organization_id` batches | Stronger — CMS/settings/flags/settlements/Sales Statements/media/mailbox/press/submissions + **financial_audit_events** + **apify_usage_months** |
| 4 | Membership + RLS hardening | Staff org/artist helpers; press/promo/downloads; org SaaS tables; video/feedback/mailbox notes; platform_admins helper; Apify budget per org |
| 5 | Cache tags + R2 prefixes | Stronger — public caches org-keyed; tenant keys + dual-read; **sync cover-art** uses `createSyncUploadFn(…, job.organizationId)` |
| 6 | Cron/sync/credentials per org | Sync queue multi-org; **Apify Spotify plays** admin=host org, cron/sync-trigger=**fan-out active orgs** with wall budget; staff RLS on sync_queue |
| 7 | Marketing + platform account UI | Partial — `/pricing`, `/onboarding` |
| 8 | Stripe + provisioning | Env-gated checkout membership; webhook logic in **`processStripeWebhookEvent`** (unit-tested: checkout activate, payment_failed, dedupe) |
| 9 | Onboarding / assistenz | Partial — register flow ported |
| 10 | Custom domains | DAL + admin API; **DNS TXT verification** (`verifyDomainTxtToken`); force-verify only non-prod |
| 11 | Platform ops console | Stronger — accessible org list; export/domains/webhooks/keys require org access |
| 12 | Isolation QA + pilots | Unit isolation + e2e + **`check:organization-scope`**; pilot runbook below |
| 13 | Cleanup | Partial — residual inventory; ops apply `reset.sql` still open |

## Residual isolation inventory (phase 13)

| Item | Status | Notes |
|------|--------|--------|
| Apply `supabase/reset.sql` on staging/prod | **Ops** | Required before pilot hosts; all RLS/column expands land here |
| Stripe live E2E (test keys + webhook forward) | Open | Checkout membership + `processStripeWebhookEvent` unit-covered |
| Custom domain DNS verification ops | Stronger | Real TXT check (`verifyDomainTxtToken`); org-gated admin APIs; checklist in DEPLOYMENT |
| Platform super-admin UI polish | Stronger | Org list/export/webhooks/keys/audit gated; non-platform staff only see memberships + Org #0 |
| Partner API / Believe multi-tenant | Later | Not core isolation |
| Portal billing audit org stamp | Done | `ctx.organizationId` via `withPortalMembership` |
| Apify cron multi-org fan-out | Done | `listActiveOrganizations` + per-org budget |
| Public page_events label analytics | Done | Filtered via org artist id set |
| `submission_form_schema` global catalogue | Keep | Label-agnostic form definition |
| Global role tables (`users`, `role_permissions`) | Keep | Platform-wide; not per-label data |
| Organization branding injector | Done | `OrganizationBrandingInjector` in root `app/layout.tsx` |
| Portal FAQ (`portal_faq_*`) | Done | `organization_id` + org unique slugs; admin/portal APIs host-scoped |
| Admin maintenance destructive routes | Done | purge/strip/clear/reset/cleanup filter host `organizationId`; platform-wide logs Org #0 only |

## Pilot staging runbook

Run this on **staging** after merging or deploying `feat/multi-tenant-saas`. Full DNS/Stripe env notes: [DEPLOYMENT.md](../../DEPLOYMENT.md) (Multi-tenant SaaS section).

### 1. Schema

1. Backup staging DB.
2. Run full `supabase/reset.sql` in Supabase SQL Editor.
3. Smoke SQL:

```sql
SELECT public.user_can_access_organization('00000000-0000-0000-0000-000000000000');
SELECT COUNT(*) FROM public.organizations;
SELECT COUNT(*) FROM public.artists WHERE organization_id IS NULL; -- expect 0
```

### 2. darkTunes continuity (Org #0)

1. Open staging apex host (or localhost) — public home/roster load.
2. Admin login → File Explorer, Sales Statements, Settings still work.
3. No 500s from missing columns (`organization_id`, composite PKs).

### 3. Host / pilot org

1. Ensure seed/demo org exists (e.g. slug `demo-label`, id `11111111-…` if seeded).
2. Hit `{slug}.{PLATFORM_ROOT_DOMAIN}` (or hosts file) — `x-organization-id` must resolve to pilot, not Org #0 when strict hosts enabled.
3. Create one artist/release on pilot only; confirm Org #0 admin list does not show them when scoped.

### 4. Staff isolation smoke

1. Label A admin JWT (browser Supabase): cannot `select` Host B `assets` / `artists` drafts (RLS).
2. `/admin/organizations` lists only accessible orgs for non-platform staff.
3. Custom domain: pending domain → Check DNS fails without TXT; with TXT → verified.

### 5. Stripe (test mode)

1. Set Stripe test env vars; webhook → `/api/stripe/webhook`.
2. `/onboarding` → checkout → `checkout.session.completed` → subscription + features + org `active`.
3. Replay same event id → `duplicate: true`.

### 6. Cron / Apify

1. Manual admin Spotify sync on Host A only charges Host A budget.
2. Cron/sync-trigger returns `multiOrg: true` and per-org rows without mixing budgets.

## PR #417 port map

| Module | Source path |
|--------|-------------|
| Constants / host | `src/lib/organizations/*` |
| Org DAL | `src/lib/api/organizations.ts` |
| Plans / features | `src/lib/api/plans.ts`, `features.ts`, `provisionPlanFeatures.ts` |
| Stripe | `src/lib/stripe/client.ts`, `app/api/stripe/*` |
| Custom domains | `src/lib/api/customDomains.ts` |
| Onboarding | `app/onboarding/*` |
| Admin UI | `OrganizationsManager.tsx` |
| Strategy docs | `docs/strategy/*` (optional; rewrite copy with humanizer) |
| Partner API / Believe | later; not required for multi-tenant core |

## Related docs

- [data-and-schema.md](data-and-schema.md) — DAL, ISR, R2
- [architecture.md](architecture.md) — surfaces, caching
- [backend.md](backend.md) — cron, admin auth
- [SECURITY.md](../../SECURITY.md) — isolation
- [DEPLOYMENT.md](../../DEPLOYMENT.md) — domains, Stripe env
- [PRD.md](../../PRD.md) — product surfaces
