# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Artist Portal — Document Vault**: `/portal/documents` — artists upload and manage PDF/DOCX contracts, GEMA forms, and splits documents. Stored in R2 under `artist-documents/{artistId}/`. `artist_documents` table with RLS. Route handlers: `POST /api/portal/documents/upload` (20 MB), `DELETE /api/portal/documents/[id]`.
- **Artist Portal — Calendar**: `/portal/calendar` — tour date / event calendar view for the artist's own concerts.
- **Artist Portal — Interviews**: `/portal/interviews` — interview request management and scheduling.
- **Artist Portal — Onboarding Wizard**: `/portal/onboarding` — first-run wizard guiding new artists through profile setup, photo upload, and social links.
- **Artist Portal — Help / FAQ**: `/portal/help` — FAQ page and artist support contact form.
- **Artist Portal — Video Submission**: `/portal/releases/videos/new` — artists submit new video entries for admin review (`is_visible=false`). Notifies admins via `editor_notifications` and email.
- **Admin — Accounting tab**: `/admin/accounting` — Tab A: SOS Generator (upload royalty PDFs for any artist via `uploadStatement` Server Action); Tab B: Statement History table.
- **Admin — System tab**: `/admin/system` — Health dashboard, Audit/Error/App-Error logs with filtering, Media Library, and Maintenance panel (clear logs, purge orphaned releases, reset checklists, manage accreditations, clear stats).
- **Admin — Release Submissions**: `/admin/release-submissions` — review and approve/reject artist-submitted releases.
- **Admin — Video Submissions**: `/admin/video-submissions` — review and approve/reject artist-submitted videos.
- **Supabase Read Replica client**: `src/lib/supabase/replica.ts` exports `createReplicaSupabaseClient()`. When `SUPABASE_REPLICA_URL` and `SUPABASE_REPLICA_ANON_KEY` are set, analytics queries and admin health/log reads are routed to the replica. Falls back to primary DB when env vars are unset.
- **Admin Maintenance API routes**: `POST /api/admin/maintenance/clear-logs`, `purge-releases`, `reset-checklists`, `clear-accreditations`, `reset-accreditations`, `clear-stats`.

### Changed

- **SOS webhook removed**: `POST /api/webhooks/sos` and `POST /api/webhooks/sos/confirm` deleted. Statement-of-Sales PDFs are now uploaded via a direct `uploadStatement` Server Action (`app/portal/statements/_actions/uploadStatement.ts`) authenticated by the admin's Supabase session. `SOS_WEBHOOK_SECRET` env var is no longer needed.
- `isValidArtistId` and `isValidPeriod` moved from the deleted `src/lib/sos/sosWebhook.ts` into the new `src/lib/sos/validation.ts`.

### Fixed

- **ESLint 0 warnings**: Added `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`, `caughtErrorsIgnorePattern: '^_'` to the `@typescript-eslint/no-unused-vars` rule in `eslint.config.js`. Removed stale `eslint-disable-next-line` directives in `heroItems.ts` and `sos-csv-processor.worker.ts`.
- **`ArtistsManager.tsx` dead state**: Removed vestigial `editingArtist` / `setEditingArtist` state and `artistToFormData()` — editing now navigates to `/admin/artists/[id]/edit`; the inline dialog is create-only.
- **`ColorThemeManager.tsx` useEffect deps**: Added `draft.typography` to the dependency array alongside the individual font-family properties.
- **Upload size limits in SECURITY.md**: Corrected `/api/portal/upload-release-cover` from 10 MB → 5 MB. Added `/api/portal/upload-asset` as 20 MB (was incorrectly listed as 50 MB). Added `/api/portal/documents/upload` at 20 MB.

## [1.1.0] — 2026-06-06

### Added

- **Statement of Sales Email Notifications**: Artists receive an automatic email via Resend when a new statement is uploaded. Email includes period, optional amount, and link to `/portal/statements` for secure download.
- **Admin Statements Manager**: New read-only tab in Admin dashboard to monitor all uploaded statements across all artists.

### Changed

- `sendStatementNotification()` is called after every successful `sales_statements` insert (non-blocking).
