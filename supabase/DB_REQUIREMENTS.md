# darkTunes Database Requirements

This document defines the **permanent, non-negotiable** structural requirements
for the darkTunes Supabase PostgreSQL database. Any developer or AI agent
modifying the schema **must** verify compliance with all rules below.

---

## 1. Single Source of Truth

| Artefact | Purpose |
| --- | --- |
| `supabase/reset.sql` | The ONE AND ONLY schema script. All table definitions, column additions, RLS policies, triggers, seed data, and enum types live here. |
| `src/types/database.ts` | TypeScript mirror of the schema. Must be kept in sync with `reset.sql` after every change. |

⛔ **Migration files are strictly forbidden.** The directory `supabase/migrations/`
must not exist. Any incremental SQL patch must be folded into `reset.sql` as
an idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` guard **and** reflected
in the `CREATE TABLE` definition.

---

## 2. Third Normal Form (3NF) — Mandatory

The schema must comply with the **Third Normal Form** at all times:

> Every non-key attribute must depend on **the whole key, and nothing but the key**.

### 2.1 No Redundant Columns (1NF + 2NF foundation)

- Each column stores exactly one atomic value.
- No calculated or derived columns that duplicate data already derivable from
  other columns via a query.

### 2.2 No Transitive Dependencies (3NF)

A transitive dependency exists when a non-key column A depends on another
non-key column B, which in turn depends on the primary key PK:

```text
PK → B → A   ← FORBIDDEN (A should live in the table whose PK is B)
```

#### Resolved violations (historical — do not reintroduce)

| Column removed | Table | Reason |
| --- | --- | --- |
| `artist_name` | `releases`, `videos`, `concerts` | Transitive: `artist_id → artists.name`. Use JOIN instead. |
| `instagram_url`, `youtube_url`, `website_url`, `bandcamp_url`, `spotify_url`, `apple_music_url`, `tiktok_url`, `facebook_url` | `artist_profiles` | Redundant with `artists.*_url`. Canonical source: `artists` table. |

### 2.3 Single Source per Attribute

Each logical attribute has **exactly one canonical table**:

| Attribute | Canonical table | Notes |
| --- | --- | --- |
| Social / streaming URLs | `artists` | `instagram_url`, `spotify_url`, `youtube_url`, `apple_music_url`, `facebook_url`, `twitter_url`, `tiktok_url`, `bandcamp_url`, `website_url`, `shop_url` |
| Artist primary image | `artists.image_url` | `artist_profiles.photo_url` is the EPK press photo (different purpose) |
| Artist genres | `artists.genres` | `artist_profiles.genres` is an optional EPK override (intentional) |
| CMS key-value settings | `site_settings` | Never replicate in code constants |

### 2.4 Junction Tables for Many-to-Many Relationships

When an entity belongs to multiple instances of another entity, use a junction
table. Never store array-of-IDs in a column for relationships that require
FK integrity:

| Junction table | Entities |
| --- | --- |
| `artist_members` | `auth.users` ↔ `artists` (portal access) |
| `release_artists` | `releases` ↔ `artists` (credits) |
| `news_post_artists` | `news_posts` ↔ `artists` |
| `concert_artists` | `concerts` ↔ `artists` |
| `asset_artists` | `assets` ↔ `artists` |
| `user_custom_roles` | `auth.users` ↔ `custom_roles` |

---

## 3. Referential Integrity

- All foreign keys must reference the correct table and cascade delete/nullify
  appropriately:
  - **ON DELETE CASCADE** when child rows are meaningless without the parent
    (e.g., `releases.artist_id`, `artist_profiles.artist_id`).
  - **ON DELETE SET NULL** when the child row remains valid without the parent
    (e.g., `assets.uploaded_by`, `videos.artist_id`).
- **`promo_tracks.artist_id`** — optional FK to `artists`. Set when the track
  belongs to a known system artist. `artist_name` remains the display name and
  must match `artists.name` when `artist_id` is set.

---

## 4. Idempotency Requirements

Every schema change in `reset.sql` must be safe to run on **both a fresh
database and an existing database with live data**:

| Object | Idempotent pattern |
| --- | --- |
| Tables | `CREATE TABLE IF NOT EXISTS` |
| Columns | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| Indexes | `CREATE INDEX IF NOT EXISTS` |
| Triggers | `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER` |
| Policies | `DROP POLICY IF EXISTS` then `CREATE POLICY` |
| Enum types | `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object …` |
| Functions | `CREATE OR REPLACE FUNCTION` |
| Enum values | `ALTER TYPE … ADD VALUE IF NOT EXISTS` inside DO block |

---

## 5. Row Level Security (RLS)

- **All tables must have RLS enabled** (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`).
- Policies follow the naming convention: `"table: actor action"`,
  e.g. `"artists: public read visible"`, `"releases: admin delete"`.
- Never bypass RLS by accessing tables directly — use `SECURITY DEFINER`
  functions (`get_my_role()`, `has_permission()`) where infinite-recursion
  would otherwise occur.

---

## 6. Naming Conventions

| Object | Convention | Example |
| --- | --- | --- |
| Tables | `snake_case`, plural | `artist_members`, `press_photos` |
| Columns | `snake_case` | `artist_id`, `created_at` |
| Indexes | `idx_<table>_<column(s)>` | `idx_releases_artist_id` |
| Triggers | `trg_<table>_<purpose>` | `trg_artists_updated_at` |
| Policies | `"<table>: <actor> <action>"` | `"artists: admin delete"` |
| Functions | `snake_case` | `get_my_role()`, `set_updated_at()` |

---

## 7. Audit & Compliance

- **Role changes**: logged automatically in `role_changes` via trigger.
- **Permission changes**: logged automatically in `rbac_audit_log` via trigger.
- **Admin actions**: written to `admin_audit_log` by API routes.
- **GDPR**: `newsletter_subscribers.unsubscribe_token` enables one-click
  unsubscribe (Art. 7 GDPR). Do not remove this column.

---

## 8. Checklist for Schema Changes

Before committing any schema change, verify:

- [ ] Column/table added to `CREATE TABLE` definition in `reset.sql`
- [ ] Idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` guard added
- [ ] `src/types/database.ts` updated (Row / Insert / Update shapes)
- [ ] No 3NF violations introduced (see § 2)
- [ ] RLS enabled and policies defined for the new table
- [ ] Index created for every FK and high-cardinality filter column
- [ ] No migration file created (fold everything into `reset.sql`)
- [ ] `npm run lint`, `npm test` pass
