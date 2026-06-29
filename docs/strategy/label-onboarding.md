# Label Onboarding Guide

Self-service path for new SaaS tenants (Phases 3–4).

## 1. Register

1. Visit `/onboarding`
2. Enter label name + subdomain slug (e.g. `acme-records` → `acme-records.darktunes.app`)
3. Choose plan: Starter / Professional / Business
4. Complete Stripe Checkout (if configured)

## 2. After payment

Stripe webhook activates the organization:

- `organizations.status` → `active`
- `subscriptions` row created
- `organization_features` seeded from `plan_features`

## 3. Admin setup

Super-admin (`/admin/organizations`):

1. **Partner API key** — for Believe / distributor integrations (Business plan)
2. **Webhook endpoint** — receive `artist.created`, `release.submitted`, etc.
3. **Custom domain** (Professional+) — add domain, TXT verify, then Cloudflare Custom Hostname in production

## 4. Content

1. Create artists in `/admin/artists` (scoped to tenant via `organization_id`)
2. Sync releases / configure portal invites
3. Branding: `organization_branding` row (colors seeded on register; extend via DB or future UI)

## 5. Plan limits

| Feature | Starter | Professional | Business |
|---------|---------|--------------|----------|
| max_artists | 10 | 50 | unlimited |
| custom_domain | no | yes | yes |
| partner_api | no | no | yes |
| advanced_analytics | no | yes | yes |

Enforced via `organizationHasFeature()` on Partner API and future gates.

## 6. Support

- Strategy docs: [`product-roadmap.md`](product-roadmap.md)
- API reference: [`api-v1.md`](api-v1.md)
- Believe pitch: [`demo-flow.md`](demo-flow.md)