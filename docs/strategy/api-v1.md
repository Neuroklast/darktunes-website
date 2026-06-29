# Partner API v1

Base URL: `https://darktunes.com/api/v1` (or tenant subdomain, e.g. `https://demo-label.darktunes.app/api/v1`)

## Authentication

```
Authorization: Bearer dt_live_<your-api-key>
```

API keys are created in **Admin → Organizations → Generate API Key**. Keys are shown once and stored as SHA-256 hashes.

Scopes: `read` (default on new keys). Missing scope returns `403` with code `PARTNER_SCOPE_FORBIDDEN`.

## List endpoints

All list endpoints support cursor pagination:

| Query | Description |
|-------|-------------|
| `limit` | Page size (1–200, default 50) |
| `cursor` | ISO timestamp from previous `nextCursor` |

Response shape:

```json
{
  "data": [ /* records */ ],
  "nextCursor": "2026-06-29T10:00:00.000Z"
}
```

| Method | Path | Description |
|--------|------|-------------|
| GET | `/artists` | List artists for the key's organization |
| GET | `/artists/{id}` | Single artist |
| GET | `/releases` | List releases |
| GET | `/releases/{id}` | Single release |
| GET | `/release-submissions` | List release submissions |
| GET | `/release-submissions/{id}` | Single submission |
| GET | `/analytics/export?artistId=&format=csv\|json` | Export artist analytics |

## Analytics export

- `artistId` (required): UUID scoped to the organization
- `format`: `csv` (default) or `json`

CSV includes streaming stats, territory metrics, listener metrics, and statements (same sections as the artist portal).

## Webhooks (outbound)

Configure endpoints in **Admin → Organizations → Outbound Webhooks**. Each endpoint receives a signing secret once at creation.

Events:

| Event | Trigger |
|-------|---------|
| `artist.created` | Admin creates a new artist |
| `release.submitted` | Artist submits a release via portal |
| `release.approved` | Admin accepts a submission |
| `release.rejected` | Admin rejects a submission |

Payload:

```json
{
  "event": "release.submitted",
  "organizationId": "uuid",
  "timestamp": "2026-06-29T12:00:00.000Z",
  "data": { "submissionId": "...", "artistId": "...", "title": "...", "status": "received" }
}
```

Headers:

- `Content-Type: application/json`
- `X-DarkTunes-Event`: event name
- `X-DarkTunes-Signature`: HMAC-SHA256 hex digest of the raw JSON body using the endpoint secret

Deliveries are logged in `organization_webhook_deliveries` for admin review.

## Rate limits

Not enforced in v1 — use responsibly.

## Error codes

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | `PARTNER_API_KEY_INVALID` | Missing, invalid, or revoked key |
| 403 | `PARTNER_SCOPE_FORBIDDEN` | Key lacks required scope |
| 404 | — | Resource not found or outside organization |