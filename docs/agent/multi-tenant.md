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
- Webhook handlers must be idempotent.
- Plan slugs (PR #417): `starter` | `professional` | `business`.
- Enforce limits server-side (`organizationHasFeature` / entitlements), not UI-only.

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
| 3 | DAL/API `organization_id` batches | Partial — public + admin CMS list/create (artists/releases/news/videos/concerts), genres/assets/submissions/sync/SOS admin list |
| 4 | Membership + RLS hardening | Portal + **admin request auth** binds host org (`assertAdminOrganizationAccess`; Org #0 legacy allow) |
| 5 | Cache tags + R2 prefixes | Partial — public catalog caches org-keyed; R2 helper only |
| 6 | Cron/sync/credentials per org | Partial — sync queue multi-org; **api_credentials / getExternalCredentials** per org cache; admin credential routes use request org |
| 7 | Marketing + platform account UI | Partial — `/pricing`, `/onboarding` |
| 8 | Stripe + provisioning | Done (env-gated) |
| 9 | Onboarding / assistenz | Partial — register flow ported |
| 10 | Custom domains | DAL + admin API ported; full DNS ops TBD |
| 11 | Platform ops console | Partial — `/admin/organizations` |
| 12 | Isolation QA + pilots | Unit isolation + e2e `tenant-isolation.spec.ts` (skips without env/schema) |
| 13 | Cleanup | Open |

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
