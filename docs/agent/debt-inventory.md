# Debt inventory — legacy, hardcodes, security

Living list for branch `chore/debt-legacy-hardcode-security` and follow-ups.  
Update when items move in/out of scope. Not a product PRD.

## Legacy (keep)

| Item | Location | Why keep |
|------|----------|----------|
| `/portal/analytics` redirect | `app/portal/analytics/page.tsx` | Bookmarks / old nav |
| `/portal/tour` redirect | `app/portal/tour/page.tsx` | Bookmarks → events |
| `/admin/content` redirect | `app/admin/content/page.tsx` | Old CMS entry |
| Newsletter DOI/unsub APIs | `app/api/newsletter/*` | External mailer links |
| Login code/token_hash exchange | `CentralLoginForm` | Supabase invite fallbacks |
| Users `{ role }` PATCH | `app/api/admin/users/[id]` | Older admin clients |
| Theme flat color fields | `ThemeStyleInjector` LEGACY_TOKEN_MAP | Saved CMS themes |

## Legacy (cleaned this branch)

| Item | Action |
|------|--------|
| `@deprecated usePortalTabVisibility` | Removed (zero callers; use `usePortalAnalyticsPreferences`) |
| User-Agents / Edge brand strings | `src/lib/brand/userAgent.ts` + env; newsletter-confirm uses `TENANT_LABEL_NAME`; Zammad via `readTenantBootstrap()` |
| Portaled UI under dialogs | `z-[10000]` + CI `check:overlay` |
| Mailbox chrome EN hardcodes | i18n via `admin.messages` / portal `messages_*` |

## Hardcode hotspots

| Area | Status |
|------|--------|
| i18n baseline (mostly admin) | Mailbox chrome localized; SiteSettingsManager-scale remains follow-up |
| Brand strict (Edge / UAs) | Env-driven; neutral fallbacks in brand helper |
| `MailboxSortSelect` / FolderTree | Labels prop + systemFolderLabels |

## Security residual

| Item | Severity | This branch |
|------|----------|-------------|
| CSP `style-src`/`script-src` `unsafe-inline` | Medium residual | Documented in `contentSecurityPolicy.ts` + SECURITY.md |
| In-memory rate limit without Upstash | Medium at scale | Inventory below; no behavior change |
| `select('*')` on hooks / explorer | Low–med over-fetch | Auth, role permissions, file explorer whitelisted |
| Capability share URLs | Ops secret | Documented residual |
| Overlay z-50 in modals | Functional | Fixed + CI contract |

## Rate-limit inventory (snapshot)

**In-memory** (`checkRateLimit` / `ipRateLimit.ts`): public contact, journalist applications, vitals, page-events, forgot-password, EPK share/export.

**Distributed** (`checkDistributedRateLimit`, Upstash when configured): log-error, portal uploads (asset/photo/rider/release cover/documents/fonts), cover-art-check, EPK export, feedback, submit-release/video, portal messages send, tour-planner tech-document upload.

**IP only (audit, not limit):** admin invite / resend-invite.

**Follow-up:** migrate remaining in-memory public routes to distributed when traffic warrants; prefer Upstash in multi-instance production.

## Follow-up (not this branch)

- DB `thread_id` for messages
- CSP nonces / remove unsafe-inline
- Full admin i18n baseline → 0 (SiteSettingsManager and large CMS managers)
- Invoice/SOS DAL `select('*')` rewrite
- Menubar / navigation-menu portaled z-index if used inside dialogs
