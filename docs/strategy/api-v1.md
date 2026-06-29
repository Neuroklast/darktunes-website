# Partner API v1

Base URL: `https://darktunes.com/api/v1` (or tenant subdomain)

## Authentication

```
Authorization: Bearer dt_live_<your-api-key>
```

API keys are created in **Admin → Organizations → Generate API Key**. Keys are shown once.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/artists` | List artists for the key's organization |
| GET | `/releases` | List releases |
| GET | `/release-submissions` | List release submissions |
| GET | `/analytics/export?artistId=&format=csv\|json` | Export artist analytics |

## Webhooks (outbound)

Configure endpoints in the database (`organization_webhook_endpoints`). Events:

- `artist.created`
- `release.submitted`
- `release.approved`
- `release.rejected`

Payload signed with `X-DarkTunes-Signature` (HMAC-SHA256 of body).

## Rate limits

Not enforced in v1 — use responsibly.