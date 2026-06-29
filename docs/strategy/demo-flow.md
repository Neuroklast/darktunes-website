# Believe Demo Flow

Step-by-step script for a live Believe / distributor pitch (15–20 minutes).

## Prerequisites

- Admin access to darkTunes
- Partner API key + webhook endpoint configured (`/admin/organizations`)
- At least one release submission in `accepted` or `reviewed` status

## Flow

### 1. Artist roster (2 min)

1. Open `/artists` — show visible roster cards linking to `/artists/[slug]`.
2. Mention multi-tenant readiness: each label gets isolated `organization_id` + subdomain.

### 2. Release submission → approval (4 min)

1. Portal: artist submits via `/portal/releases/new`.
2. Admin: `/admin/release-submissions` — open submission, set status to `reviewed` then `accepted`.
3. Show outbound webhook delivery (`release.submitted` → `release.approved`) if endpoint configured.

### 3. Believe export (3 min)

1. On accepted submission detail, click **Export for Believe**.
2. Open CSV — fields: title, artist, ISRC, dates, URLs.
3. If validation warnings appear (toast), explain metadata gaps before distributor upload.

### 4. Partner API v1 (4 min)

```bash
curl -H "Authorization: Bearer dt_live_…" \
  https://darktunes.com/api/v1/artists?limit=5

curl -H "Authorization: Bearer dt_live_…" \
  "https://darktunes.com/api/v1/analytics/export?artistId=UUID&format=json"
```

Reference: [`api-v1.md`](api-v1.md)

### 5. Analytics export (2 min)

1. Portal: `/portal/analytics` — CSV download (artist-facing).
2. API: same data via `/api/v1/analytics/export` for Believe integrations.

### 6. ROI talking points (3 min)

- **Time saved:** manual metadata re-entry → one-click Believe CSV + API
- **Data quality:** validation before export reduces distributor rejections
- **Integration path:** webhooks + read API today; no lock-in to Believe-specific API

See [`believe-pitch.md`](believe-pitch.md) for valuation and gap analysis.

## Success criteria

- [ ] Live webhook received (or delivery row in `organization_webhook_deliveries`)
- [ ] Believe CSV downloads without 422 validation errors
- [ ] API returns org-scoped artists/releases only