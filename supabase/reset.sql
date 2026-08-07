-- =============================================================================
-- Music Label Platform — Complete Idempotent Database Reset
-- =============================================================================
-- This single script REPLACES all incremental migration files.
-- It is FULLY IDEMPOTENT: safe to run on a fresh database AND on an existing
-- one with live data. Tables are created with IF NOT EXISTS; columns are added
-- with ADD COLUMN IF NOT EXISTS; policies and triggers are always dropped and
-- recreated cleanly.  Existing row data is NEVER deleted.
--
-- Usage: Paste into Supabase Dashboard → SQL Editor → Run
--        (or: supabase db reset --db-url <your-db-url> < supabase/reset.sql)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- SCHEMA PERMISSIONS
-- ---------------------------------------------------------------------------
-- MANUAL PREREQUISITE: Run these commands FIRST in Supabase Dashboard SQL Editor
-- (requires postgres superuser or schema owner privileges):
--
--   ALTER SCHEMA public OWNER TO postgres;
--   GRANT ALL ON SCHEMA public TO postgres;
--   GRANT USAGE, CREATE ON SCHEMA public TO authenticated, anon, service_role;
--
-- These grants cannot be executed within this script because the Supabase
-- Dashboard SQL Editor does not run with sufficient privileges.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------
-- Create types using DO blocks with EXCEPTION handling for true idempotency.
-- This approach works in Supabase Dashboard without requiring schema OWNER rights.
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'user', 'journalist', 'artist');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.release_type AS ENUM ('album', 'ep', 'single', 'compilation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.release_type'::regtype
      AND enumlabel = 'compilation'
  ) THEN
    ALTER TYPE public.release_type ADD VALUE IF NOT EXISTS 'compilation';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_status AS ENUM ('success', 'partial', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure 'journalist' exists even if the type was created without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype
      AND enumlabel = 'journalist'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'journalist';
  END IF;
END $$;

-- Ensure 'artist' exists (added for the multi-role portal ecosystem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype
      AND enumlabel = 'artist'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'artist';
  END IF;
END $$;

-- Ensure 'press' exists (deprecated — migrated to journalist; kept for enum compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype
      AND enumlabel = 'press'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'press';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- HELPER: auto-update updated_at on every row change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- Allow the Supabase auth subsystem to call this function
GRANT USAGE  ON SCHEMA public        TO supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- TABLE: role_permissions
-- Stores per-role boolean permission flags.
-- Admin role always has full access (enforced in policies and verifyPermission).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role                public.user_role PRIMARY KEY,
  can_publish_news    BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_news       BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_artists  BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_releases BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_videos   BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_admin_panel BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES auth.users(id)
);

-- Insert default permissions for all roles (idempotent)
INSERT INTO public.role_permissions (role, can_publish_news, can_edit_news, can_manage_artists, can_manage_releases, can_manage_videos, can_view_admin_panel)
VALUES
  ('admin',      TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('editor',     TRUE,  TRUE,  FALSE, TRUE,  TRUE,  TRUE),
  ('journalist', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('artist',     FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('user',       FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role) DO NOTHING;

-- Migrate deprecated press role to journalist (idempotent)
UPDATE public.users SET role = 'journalist' WHERE role = 'press';
UPDATE public.user_roles SET role = 'journalist' WHERE role = 'press';

DROP TRIGGER IF EXISTS role_permissions_updated_at ON public.role_permissions;
CREATE TRIGGER role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- HELPER: role lookup — SECURITY DEFINER bypasses RLS when reading profiles,
-- preventing infinite recursion in policies that need to check the caller's role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.users WHERE id = auth.uid()
$$;

-- Maps deprecated `press` enum value to `journalist` for permission checks.
CREATE OR REPLACE FUNCTION public.get_effective_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN role = 'press' THEN 'journalist'::public.user_role
    ELSE role
  END
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- HELPER: permission check — system role_permissions + supplemental custom roles.
-- Admin always passes. SECURITY DEFINER bypasses RLS recursion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.users p
      JOIN public.role_permissions rp ON rp.role = (
        CASE WHEN p.role = 'press' THEN 'journalist'::public.user_role ELSE p.role END
      )
      WHERE p.id = auth.uid()
        AND CASE perm
          WHEN 'can_publish_news'     THEN rp.can_publish_news
          WHEN 'can_edit_news'        THEN rp.can_edit_news
          WHEN 'can_manage_artists'   THEN rp.can_manage_artists
          WHEN 'can_manage_releases'  THEN rp.can_manage_releases
          WHEN 'can_manage_videos'    THEN rp.can_manage_videos
          WHEN 'can_view_admin_panel' THEN rp.can_view_admin_panel
          ELSE FALSE
        END
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_custom_roles ucr
      JOIN public.custom_role_permissions crp ON crp.role_id = ucr.role_id
      WHERE ucr.user_id = auth.uid()
        AND crp.permission_name = perm
    );
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE public.profiles RENAME TO users;
EXCEPTION WHEN undefined_table THEN NULL;
          WHEN duplicate_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- One-to-one extension of auth.users managed by Supabase Auth.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID             PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT             NOT NULL,
  role       public.user_role NOT NULL DEFAULT 'user',
  avatar_url TEXT,
  provider   TEXT             NOT NULL DEFAULT 'email',
  full_name  TEXT,
  is_active  BOOLEAN          NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

GRANT INSERT ON public.users      TO supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- HELPER: auto-create a profile row when a new Auth user registers
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- HELPER: sync user claims to auth.users.raw_app_meta_data
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_artist_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'artist_members' THEN
      v_user_id := OLD.user_id;
    ELSIF TG_TABLE_NAME = 'users' THEN
      v_user_id := OLD.id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'artist_members' THEN
      v_user_id := NEW.user_id;
    ELSIF TG_TABLE_NAME = 'users' THEN
      v_user_id := NEW.id;
    END IF;
  END IF;

  SELECT role::TEXT INTO v_role FROM public.users WHERE id = v_user_id;
  SELECT artist_id INTO v_artist_id FROM public.artist_members WHERE user_id = v_user_id LIMIT 1;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role, 'artist_id', v_artist_id)
  WHERE id = v_user_id;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role      public.user_role := 'user';
  v_meta_role TEXT;
  v_artist_id UUID;
BEGIN
  v_meta_role := NEW.raw_user_meta_data->>'role';
  IF v_meta_role IN ('admin', 'editor', 'journalist', 'artist', 'user', 'press') THEN
    v_role := v_meta_role::public.user_role;
  END IF;

  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, v_role)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Artist portal invites pass artist_id in user metadata
  BEGIN
    v_artist_id := (NEW.raw_user_meta_data->>'artist_id')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_artist_id := NULL;
  END;

  IF v_artist_id IS NOT NULL THEN
    UPDATE public.artists
    SET user_id = NEW.id
    WHERE id = v_artist_id AND (user_id IS NULL OR user_id = NEW.id);

    INSERT INTO public.artist_members (user_id, artist_id, member_role)
    VALUES (NEW.id, v_artist_id, 'owner')
    ON CONFLICT (user_id, artist_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Idempotent guard for column added after initial schema creation
-- (avatar_url, provider, full_name, is_active are defined in CREATE TABLE above)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- Guard: existing databases may have role as TEXT with a CHECK constraint
-- (created before the user_role enum was introduced). Drop the constraint and
-- cast the column to the enum so that all five role values are accepted.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Drop ALL policies in the public schema before any column-type alterations.
-- Policies are fully recreated below, so this is safe and idempotent.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'role'
      AND data_type    = 'text'
  ) THEN
    -- Drop the text default first; it cannot be auto-cast to the enum type.
    ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.users
      ALTER COLUMN role TYPE public.user_role USING role::public.user_role;
    -- Re-apply the default as an enum literal.
    ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user'::public.user_role;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.users;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


DROP TRIGGER IF EXISTS on_user_role_change ON public.users;
CREATE TRIGGER on_user_role_change
  AFTER UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_claims();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- HELPER: auto-link Spotify OAuth users to matching artist rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_oauth_artist_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_spotify_id TEXT;
  v_artist_id  UUID;
BEGIN
  v_spotify_id := NEW.raw_user_meta_data->>'provider_id';

  IF NEW.raw_app_meta_data->>'provider' = 'spotify' AND v_spotify_id IS NOT NULL THEN
    SELECT id INTO v_artist_id
    FROM public.artists
    WHERE spotify_id = v_spotify_id
    LIMIT 1;

    IF v_artist_id IS NOT NULL THEN
      UPDATE public.artists SET user_id = NEW.id WHERE id = v_artist_id;
      -- Insert into artist_members instead of overwriting the user's editorial role.
      -- ON CONFLICT DO NOTHING keeps this idempotent on repeated OAuth logins.
      INSERT INTO public.artist_members (user_id, artist_id, member_role)
      VALUES (NEW.id, v_artist_id, 'owner')
      ON CONFLICT (user_id, artist_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_oauth_artist_verify ON auth.users;
CREATE TRIGGER on_oauth_artist_verify
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_oauth_artist_verification();

-- HELPER: journalist application status → user role sync
-- When an application is approved, the applicant's profile role is set to
-- 'journalist'. When rejected (or a prior approval is reversed), the role
-- reverts to 'user'. Running as SECURITY DEFINER so the trigger can write
-- to public.users even when invoked by a non-admin session.
CREATE OR REPLACE FUNCTION public.handle_journalist_application_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op when the status column did not actually change.
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- No-op when the application is not linked to an auth user.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    UPDATE public.users SET role = 'journalist' WHERE id = NEW.user_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.users SET role = 'user' WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journalist_application_status_change ON public.journalist_applications;
CREATE TRIGGER trg_journalist_application_status_change
  AFTER UPDATE OF status ON public.journalist_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_journalist_application_status_change();

INSERT INTO public.users (id, email, role)
SELECT id, email, 'user'
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- TABLE: genres  (centrally managed genre catalogue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.genres (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default genres (idempotent)
INSERT INTO public.genres (name, slug) VALUES
  ('Industrial',    'industrial'),
  ('EBM',           'ebm'),
  ('Darkwave',      'darkwave'),
  ('Synthpop',      'synthpop'),
  ('Gothic Rock',   'gothic-rock'),
  ('Dark Electro',  'dark-electro'),
  ('Aggrotech',     'aggrotech'),
  ('Power Noise',   'power-noise'),
  ('Death Rock',    'death-rock'),
  ('New Wave',      'new-wave'),
  ('Post-Punk',     'post-punk'),
  ('Ambient',       'ambient'),
  ('Dark Ambient',  'dark-ambient'),
  ('Noise',         'noise'),
  ('Techno',        'techno'),
  ('House',         'house'),
  ('Metal',         'metal'),
  ('Black Metal',   'black-metal'),
  ('Electronic',    'electronic'),
  ('Experimental',  'experimental')
ON CONFLICT (slug) DO NOTHING;

-- RLS
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
-- Public read
DROP POLICY IF EXISTS "genres_read_public" ON public.genres;
CREATE POLICY "genres_read_public" ON public.genres
  FOR SELECT USING (true);
-- Admin/editor insert/update/delete
DROP POLICY IF EXISTS "genres_write_admin" ON public.genres;
CREATE POLICY "genres_write_admin" ON public.genres
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- TABLE: artists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artists (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT        NOT NULL,
  slug             TEXT        NOT NULL UNIQUE,
  bio              TEXT,
  genres           TEXT[]      NOT NULL DEFAULT '{}',
  image_url        TEXT,
  spotify_url      TEXT,
  apple_music_url  TEXT,
  instagram_url    TEXT,
  youtube_url      TEXT,
  website_url      TEXT,
  featured         BOOLEAN     NOT NULL DEFAULT FALSE,
  country          TEXT,
  founding_year    INTEGER,
  hometown         TEXT,
  email            TEXT,
  vat_number       TEXT,
  is_eu_non_german BOOLEAN     NOT NULL DEFAULT FALSE,
  notes            TEXT,
  -- External API sync IDs (Bug 1 fix — were missing from initial schema)
  spotify_id       TEXT,
  discogs_id       TEXT,
  songkick_id      TEXT,
  bandsintown_id   TEXT,
  last_synced_at   TIMESTAMPTZ,
  user_id          UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  is_visible       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Portrait focal-point and zoom (percentage 0-100 for x/y, scale ≥ 1)
  image_position_x FLOAT               DEFAULT 50,
  image_position_y FLOAT               DEFAULT 50,
  image_scale      FLOAT               DEFAULT 1,
  -- Social media / shop links
  facebook_url     TEXT,
  twitter_url      TEXT,
  tiktok_url       TEXT,
  bandcamp_url     TEXT,
  shop_url         TEXT,
  soundcloud_url   TEXT,
  -- Branding & platform metadata
  logo_url         TEXT,
  platform_links   JSONB,
  storage_quota_bytes BIGINT DEFAULT NULL,
  smart_links      JSONB DEFAULT '[]'::JSONB,
  bandsintown_api_key TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions — no-ops on a fresh DB, safe on existing data.
-- CI: `npm run verify:schema-columns` requires every non-structural CREATE
-- column on `artists` / `artist_epks` to appear here (CREATE TABLE IF NOT EXISTS
-- is a no-op on live DBs).
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS name           TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS slug           TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS bio            TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS genres         TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS image_url      TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS spotify_url    TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS apple_music_url TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS instagram_url  TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS youtube_url    TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS website_url    TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS featured       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS spotify_id     TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS discogs_id     TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS songkick_id    TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS bandsintown_id TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS facebook_url   TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS twitter_url    TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS tiktok_url     TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS bandcamp_url   TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS shop_url       TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS founding_year  INTEGER;
-- hometown lived on artist_epks until Track 2/3 consolidation; without this
-- ADD COLUMN, existing prod DBs (CREATE TABLE IF NOT EXISTS no-ops) miss it and
-- portal profile PUT returns 500 ("Could not find the 'hometown' column").
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS hometown       TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS country        TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS email          TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS vat_number     TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS is_eu_non_german BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS soundcloud_url TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS is_visible     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS logo_url       TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS platform_links JSONB;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT NULL;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS smart_links JSONB DEFAULT '[]'::JSONB;
-- Portrait focal-point / zoom (added 2026-06-07)
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS image_position_x FLOAT DEFAULT 50;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS image_position_y FLOAT DEFAULT 50;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS image_scale      FLOAT DEFAULT 1;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS bandsintown_api_key TEXT;
-- Portal AGB acceptance (per artist, multi-tenant terms version from site_settings)
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS portal_terms_version TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS portal_terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS portal_terms_accepted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artists_slug     ON public.artists (slug);
CREATE INDEX IF NOT EXISTS idx_artists_featured ON public.artists (featured);
CREATE INDEX IF NOT EXISTS idx_artists_visible  ON public.artists (is_visible);
-- DEPRECATED: artists_user_id_key was a 1:1 constraint. Replaced by artist_members.
-- Kept as a DROP to remove the index from any existing database that still has it.
DROP INDEX IF EXISTS public.artists_user_id_key;
-- bio and genres are canonical on the artists table (single source of truth).
-- The portal profile form writes them directly to this table via the profile API route.
COMMENT ON COLUMN public.artists.bio IS
  'Canonical biography for public-facing pages. Written by admins directly or via the portal profile API route.';
COMMENT ON COLUMN public.artists.genres IS
  'Canonical genre list. Written by admins directly or via the portal profile API route.';

DROP TRIGGER IF EXISTS trg_artists_updated_at ON public.artists;
CREATE TRIGGER trg_artists_updated_at
  BEFORE UPDATE ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: artist_private_data
-- Staff/member-only secrets and PII. Never granted to anon.
-- Public pages must not select these columns (see PUBLIC_ARTIST_COLUMNS).
-- After backfill, secrets on public.artists are cleared so select(*) cannot leak.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_private_data (
  artist_id            UUID PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
  email                TEXT,
  vat_number           TEXT,
  notes                TEXT,
  bandsintown_api_key  TEXT,
  storage_quota_bytes  BIGINT,
  is_eu_non_german     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_private_data_email
  ON public.artist_private_data (email)
  WHERE email IS NOT NULL;

-- Idempotent backfill from artists (safe to re-run)
INSERT INTO public.artist_private_data (
  artist_id, email, vat_number, notes, bandsintown_api_key, storage_quota_bytes, is_eu_non_german
)
SELECT
  a.id,
  a.email,
  a.vat_number,
  a.notes,
  a.bandsintown_api_key,
  a.storage_quota_bytes,
  COALESCE(a.is_eu_non_german, FALSE)
FROM public.artists a
ON CONFLICT (artist_id) DO UPDATE SET
  email = COALESCE(EXCLUDED.email, public.artist_private_data.email),
  vat_number = COALESCE(EXCLUDED.vat_number, public.artist_private_data.vat_number),
  notes = COALESCE(EXCLUDED.notes, public.artist_private_data.notes),
  bandsintown_api_key = COALESCE(EXCLUDED.bandsintown_api_key, public.artist_private_data.bandsintown_api_key),
  storage_quota_bytes = COALESCE(EXCLUDED.storage_quota_bytes, public.artist_private_data.storage_quota_bytes),
  is_eu_non_german = EXCLUDED.is_eu_non_german,
  updated_at = NOW();

-- Clear secrets from the public artists row so anon/authenticated select(*) cannot leak them.
-- Canonical storage is artist_private_data (admin/member RLS only).
UPDATE public.artists SET
  email = NULL,
  vat_number = NULL,
  notes = NULL,
  bandsintown_api_key = NULL
WHERE
  email IS NOT NULL
  OR vat_number IS NOT NULL
  OR notes IS NOT NULL
  OR bandsintown_api_key IS NOT NULL;

ALTER TABLE public.artist_private_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_private_data: member read" ON public.artist_private_data;
DROP POLICY IF EXISTS "artist_private_data: member write" ON public.artist_private_data;
DROP POLICY IF EXISTS "artist_private_data: admin all" ON public.artist_private_data;

CREATE POLICY "artist_private_data: member read" ON public.artist_private_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = artist_id AND am.user_id = auth.uid()
    )
    OR public.get_my_role() IN ('admin', 'editor')
  );

CREATE POLICY "artist_private_data: member write" ON public.artist_private_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = artist_id AND am.user_id = auth.uid()
    )
    OR public.get_my_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = artist_id AND am.user_id = auth.uid()
    )
    OR public.get_my_role() IN ('admin', 'editor')
  );

CREATE POLICY "artist_private_data: admin all" ON public.artist_private_data
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- TABLE: artist_members
-- Junction table for the many-to-many relationship between users and artists.
-- Replaces the 1:1 artists.user_id constraint to support:
--   • Bands with multiple members (each member gets portal access)
--   • Producers / artists active under several project names
--   • Editors who are also signed artists (role is independent of membership)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  artist_id   UUID        NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  member_role TEXT        NOT NULL DEFAULT 'member', -- 'owner' | 'member' | 'guest'
  invited_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, artist_id)  -- one row per (user, artist) pair; no limit on how many
);

CREATE INDEX IF NOT EXISTS idx_artist_members_user_id   ON public.artist_members (user_id);
CREATE INDEX IF NOT EXISTS idx_artist_members_artist_id ON public.artist_members (artist_id);

-- Backfill: migrate existing artists.user_id links → artist_members rows.
-- Runs on every reset; ON CONFLICT DO NOTHING makes it idempotent.
INSERT INTO public.artist_members (user_id, artist_id, member_role)
SELECT user_id, id, 'owner'
FROM   public.artists
WHERE  user_id IS NOT NULL
ON CONFLICT (user_id, artist_id) DO NOTHING;


DROP TRIGGER IF EXISTS on_artist_member_change ON public.artist_members;
CREATE TRIGGER on_artist_member_change
  AFTER INSERT OR UPDATE OR DELETE ON public.artist_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_claims();

ALTER TABLE public.artist_members ENABLE ROW LEVEL SECURITY;

-- Members can read their own membership rows
DROP POLICY IF EXISTS "artist_members: own read"   ON public.artist_members;
CREATE POLICY "artist_members: own read" ON public.artist_members
  FOR SELECT USING (user_id = auth.uid());

-- Admins can manage all memberships
DROP POLICY IF EXISTS "artist_members: admin all"  ON public.artist_members;
CREATE POLICY "artist_members: admin all" ON public.artist_members
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- TABLE: asset_folders
-- (must be created before create_artist_asset_folder() and its DO backfill)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES public.asset_folders(id) ON DELETE CASCADE,
  artist_id   UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_folders_parent_id ON public.asset_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_asset_folders_artist_id ON public.asset_folders(artist_id);
-- Prevent duplicate folder names within the same directory (NULL parent = root).
-- COALESCE converts NULL parent_id to '' so the unique index treats NULLs as equal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_folders_name_parent
  ON public.asset_folders (name, COALESCE(parent_id::text, ''));

-- ---------------------------------------------------------------------------
-- FUNCTION + TRIGGER: auto-create artist folder in asset_folders on artist insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_artist_asset_folder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_root_id UUID;
BEGIN
  -- Ensure the top-level "artists" root folder exists
  INSERT INTO public.asset_folders (name, parent_id, artist_id, created_by)
  VALUES ('artists', NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_root_id
  FROM public.asset_folders
  WHERE name = 'artists' AND parent_id IS NULL
  LIMIT 1;

  -- Create a subfolder named after the artist under the root
  INSERT INTO public.asset_folders (name, parent_id, artist_id, created_by)
  VALUES (NEW.name, v_root_id, NEW.id, NULL)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_artists_create_folder ON public.artists;
CREATE TRIGGER trg_artists_create_folder
  AFTER INSERT ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.create_artist_asset_folder();

-- Idempotent: create folders for all existing artists that don't have one yet
DO $$
DECLARE
  v_root_id UUID;
  v_artist  RECORD;
BEGIN
  -- Ensure root folder
  INSERT INTO public.asset_folders (name, parent_id, artist_id, created_by)
  VALUES ('artists', NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_root_id
  FROM public.asset_folders
  WHERE name = 'artists' AND parent_id IS NULL
  LIMIT 1;

  -- For each artist without a dedicated folder
  FOR v_artist IN
    SELECT a.id, a.name FROM public.artists a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.asset_folders f WHERE f.artist_id = a.id
    )
  LOOP
    INSERT INTO public.asset_folders (name, parent_id, artist_id, created_by)
    VALUES (v_artist.name, v_root_id, v_artist.id, NULL)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- TABLE: releases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.releases (
  id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT                NOT NULL,
  artist_id       UUID                REFERENCES public.artists (id) ON DELETE CASCADE,
  release_date    DATE                NOT NULL,
  cover_art       TEXT,
  type            public.release_type NOT NULL,
  spotify_url     TEXT,
  apple_music_url TEXT,
  youtube_url     TEXT,
  bandcamp_url    TEXT,
  smartlink_url   TEXT,
  featured        BOOLEAN             NOT NULL DEFAULT FALSE,
  itunes_id       TEXT                UNIQUE,
  -- External API sync fields
  spotify_id      TEXT,
  discogs_id      TEXT,
  isrc            TEXT,
  barcode         TEXT,
  catalog_number  TEXT,
  preview_url     TEXT,
  smart_url       TEXT,
  platform_links  JSONB,
  popularity      INTEGER,
  -- Visibility toggle: FALSE hides the release from public
  is_visible      BOOLEAN             NOT NULL DEFAULT TRUE,
  is_promo        BOOLEAN             NOT NULL DEFAULT FALSE,
  -- Optional hero customisation per release
  promo_text      TEXT,
  hero_bg_url     TEXT,
  -- Hero button overrides (primary + secondary)
  hero_primary_btn_label   TEXT,
  hero_primary_btn_action  TEXT,
  hero_primary_btn_href    TEXT,
  hero_secondary_btn_label TEXT,
  hero_secondary_btn_action TEXT,
  hero_secondary_btn_href  TEXT,
  guest_artists            TEXT,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Idempotent guards for columns added after initial schema creation.
-- All columns listed here MUST have a guard so that existing databases are updated
-- safely when running this script (CREATE TABLE IF NOT EXISTS is a no-op on existing
-- tables, so guards are the only way to add new columns to live databases).
-- External API sync fields
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS spotify_id     TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS discogs_id     TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS isrc           TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS barcode        TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS catalog_number TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS preview_url    TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS smart_url      TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS platform_links JSONB;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS popularity     INTEGER;
-- Visibility and promo flags
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS is_visible     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS is_promo       BOOLEAN NOT NULL DEFAULT FALSE;
-- Hero customisation
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS promo_text     TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_bg_url    TEXT;
-- Hero button overrides (primary + secondary)
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_primary_btn_label  TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_primary_btn_action TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_primary_btn_href   TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_secondary_btn_label  TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_secondary_btn_action TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS hero_secondary_btn_href   TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS guest_artists             TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS featured_until            TIMESTAMPTZ;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS featured_removed_reason   TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS bandcamp_url             TEXT;
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS smartlink_url            TEXT;
-- Sync protection: auto | manual_until_street | locked
ALTER TABLE public.releases ADD COLUMN IF NOT EXISTS sync_policy TEXT NOT NULL DEFAULT 'auto';
DO $$ BEGIN
  ALTER TABLE public.releases
    ADD CONSTRAINT releases_sync_policy_check
    CHECK (sync_policy IN ('auto', 'manual_until_street', 'locked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN public.releases.sync_policy IS
  'auto: normal sync merge; manual_until_street: no fuzzy merge before release_date; locked: never fuzzy-merge.';
-- Pre-existing manual placeholders (no external IDs) default to street-date protection
UPDATE public.releases
SET sync_policy = 'manual_until_street'
WHERE sync_policy = 'auto'
  AND spotify_id IS NULL
  AND itunes_id IS NULL
  AND discogs_id IS NULL;
-- Upgrade FK from SET NULL → CASCADE (idempotent via drop+add)
ALTER TABLE public.releases DROP CONSTRAINT IF EXISTS releases_artist_id_fkey;
ALTER TABLE public.releases ADD CONSTRAINT releases_artist_id_fkey
  FOREIGN KEY (artist_id) REFERENCES public.artists (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_releases_artist_id    ON public.releases (artist_id);
CREATE INDEX IF NOT EXISTS idx_releases_release_date ON public.releases (release_date DESC);
CREATE INDEX IF NOT EXISTS idx_releases_featured     ON public.releases (featured);
CREATE INDEX IF NOT EXISTS idx_releases_itunes_id    ON public.releases (itunes_id);
CREATE INDEX IF NOT EXISTS idx_releases_visible      ON public.releases (is_visible);
-- Full UNIQUE constraints (required for PostgREST upsert — partial indexes are unsupported).
-- Pre-flight deduplication: if any spotify_id / discogs_id value appears more than once,
-- nullify the duplicates (keeping the row with the earliest created_at) so the UNIQUE
-- constraint can always be applied safely on a live database.  On a clean database this
-- is a no-op.
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY spotify_id
           ORDER BY created_at, id
         ) AS rn
  FROM   public.releases
  WHERE  spotify_id IS NOT NULL
)
UPDATE public.releases
SET    spotify_id = NULL
FROM   dupes
WHERE  releases.id = dupes.id
  AND  dupes.rn > 1;

WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY discogs_id
           ORDER BY created_at, id
         ) AS rn
  FROM   public.releases
  WHERE  discogs_id IS NOT NULL
)
UPDATE public.releases
SET    discogs_id = NULL
FROM   dupes
WHERE  releases.id = dupes.id
  AND  dupes.rn > 1;

ALTER TABLE public.releases DROP CONSTRAINT IF EXISTS releases_spotify_id_key;
DO $$ BEGIN
  DROP INDEX IF EXISTS public.releases_spotify_id_key;
EXCEPTION
  WHEN dependent_objects_still_exist THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.releases ADD CONSTRAINT releases_spotify_id_key UNIQUE (spotify_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.releases DROP CONSTRAINT IF EXISTS releases_discogs_id_key;
DO $$ BEGIN
  DROP INDEX IF EXISTS public.releases_discogs_id_key;
EXCEPTION
  WHEN dependent_objects_still_exist THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.releases ADD CONSTRAINT releases_discogs_id_key UNIQUE (discogs_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_releases_updated_at ON public.releases;
CREATE TRIGGER trg_releases_updated_at
  BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: news_posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.news_posts (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT        NOT NULL,
  slug         TEXT        NOT NULL UNIQUE,
  excerpt      TEXT,
  content      TEXT        NOT NULL,
  image_url    TEXT,
  featured     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_press_only BOOLEAN    NOT NULL DEFAULT FALSE,
  status       TEXT        NOT NULL DEFAULT 'published',
  artist_id    UUID        REFERENCES public.artists (id) ON DELETE SET NULL,
  reviewed_by  UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  embargo_until TIMESTAMPTZ,
  media_contact TEXT,
  release_category TEXT,
  -- Hero background image (separate from cover image_url)
  hero_bg_url  TEXT,
  -- Hero button overrides (primary + secondary)
  hero_primary_btn_label   TEXT,
  hero_primary_btn_action  TEXT,
  hero_primary_btn_href    TEXT,
  hero_secondary_btn_label TEXT,
  hero_secondary_btn_action TEXT,
  hero_secondary_btn_href  TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS featured       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS featured_until  TIMESTAMPTZ;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS featured_removed_reason TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS is_press_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS status        TEXT    NOT NULL DEFAULT 'published';
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS artist_id     UUID    REFERENCES public.artists (id) ON DELETE SET NULL;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS reviewed_by   UUID    REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS embargo_until    TIMESTAMPTZ;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS media_contact    TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS release_category TEXT;
-- Hero background image (separate from cover image_url)
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_bg_url TEXT;
-- Hero button overrides (primary + secondary)
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_primary_btn_label  TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_primary_btn_action TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_primary_btn_href   TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_secondary_btn_label  TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_secondary_btn_action TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS hero_secondary_btn_href   TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS published_at_timezone TEXT;

CREATE INDEX IF NOT EXISTS idx_news_posts_slug         ON public.news_posts (slug);
CREATE INDEX IF NOT EXISTS idx_news_posts_published_at ON public.news_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_status       ON public.news_posts (status);
CREATE INDEX IF NOT EXISTS idx_news_posts_artist_id    ON public.news_posts (artist_id);

DROP TRIGGER IF EXISTS trg_news_posts_updated_at ON public.news_posts;
CREATE TRIGGER trg_news_posts_updated_at
  BEFORE UPDATE ON public.news_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: release_artists  (many-to-many: releases ↔ artists)
-- Allows multiple artists to be credited on a single release (featurings, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.release_artists (
  release_id UUID NOT NULL REFERENCES public.releases (id) ON DELETE CASCADE,
  artist_id  UUID NOT NULL REFERENCES public.artists  (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_release_artists_release_id ON public.release_artists (release_id);
CREATE INDEX IF NOT EXISTS idx_release_artists_artist_id  ON public.release_artists (artist_id);

-- RLS for release_artists
ALTER TABLE public.release_artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "release_artists: public read"              ON public.release_artists;
DROP POLICY IF EXISTS "release_artists: can_manage_releases write" ON public.release_artists;
CREATE POLICY "release_artists: public read" ON public.release_artists
  FOR SELECT USING (true);
CREATE POLICY "release_artists: can_manage_releases write" ON public.release_artists
  FOR ALL USING (public.has_permission('can_manage_releases'));

-- ---------------------------------------------------------------------------
-- TABLE: news_post_artists  (many-to-many: news_posts ↔ artists)
-- Allows a news post to be associated with multiple artists (featurings, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.news_post_artists (
  news_post_id UUID NOT NULL REFERENCES public.news_posts (id) ON DELETE CASCADE,
  artist_id    UUID NOT NULL REFERENCES public.artists    (id) ON DELETE CASCADE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (news_post_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_news_post_artists_news_post_id ON public.news_post_artists (news_post_id);
CREATE INDEX IF NOT EXISTS idx_news_post_artists_artist_id    ON public.news_post_artists (artist_id);

-- RLS for news_post_artists
ALTER TABLE public.news_post_artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "news_post_artists: public read"           ON public.news_post_artists;
DROP POLICY IF EXISTS "news_post_artists: can_publish_news write" ON public.news_post_artists;
CREATE POLICY "news_post_artists: public read" ON public.news_post_artists
  FOR SELECT USING (true);
CREATE POLICY "news_post_artists: can_publish_news write" ON public.news_post_artists
  FOR ALL USING (public.has_permission('can_publish_news'));

-- ---------------------------------------------------------------------------
-- TABLE: videos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.videos (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT        NOT NULL,
  artist_id     UUID        REFERENCES public.artists (id) ON DELETE SET NULL,
  youtube_id    TEXT        NOT NULL UNIQUE,
  thumbnail_url TEXT,
  is_visible    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_short      BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for videos (artist linkage was added after initial deploy)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS artist_id   UUID REFERENCES public.artists (id) ON DELETE SET NULL;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS is_visible  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS is_short    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_videos_youtube_id   ON public.videos (youtube_id);
CREATE INDEX IF NOT EXISTS idx_videos_artist_id    ON public.videos (artist_id);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON public.videos (published_at DESC);

DROP TRIGGER IF EXISTS trg_videos_updated_at ON public.videos;
CREATE TRIGGER trg_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: assets  (Cloudflare R2 metadata registry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assets (
  id                UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename          TEXT    NOT NULL,
  original_filename TEXT    NOT NULL,
  mime_type         TEXT    NOT NULL,
  size_bytes        BIGINT  NOT NULL,
  r2_key            TEXT    NOT NULL UNIQUE,
  public_url        TEXT    NOT NULL,
  uploaded_by       UUID    REFERENCES public.users (id) ON DELETE SET NULL,
  folder_id         UUID    REFERENCES public.asset_folders (id) ON DELETE SET NULL,
  artist_id         UUID    REFERENCES public.artists (id) ON DELETE SET NULL,
  tags              TEXT[]  NOT NULL DEFAULT '{}',
  sha256_hash       TEXT,
  release_id        UUID    REFERENCES public.releases (id) ON DELETE SET NULL,
  alt_text              TEXT,
  is_press_approved     BOOLEAN NOT NULL DEFAULT FALSE,
  press_suggested       BOOLEAN NOT NULL DEFAULT FALSE,
  press_category        TEXT,
  press_caption         TEXT,
  photographer_credit   TEXT,
  downloadable_for_press BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.asset_folders(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS sha256_hash TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS original_filename TEXT NOT NULL DEFAULT '';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_press_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS press_suggested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS press_category TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS press_caption TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS photographer_credit TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS downloadable_for_press BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_assets_uploaded_by ON public.assets (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_assets_mime_type   ON public.assets (mime_type);
CREATE INDEX IF NOT EXISTS idx_assets_created_at  ON public.assets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_folder_id   ON public.assets (folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_artist_id   ON public.assets (artist_id);
CREATE INDEX IF NOT EXISTS idx_assets_sha256_hash ON public.assets (sha256_hash);

-- Aggregate catalog storage (avoids PostgREST row-limit undercount on SELECT size_bytes)
CREATE OR REPLACE FUNCTION public.get_assets_storage_stats()
RETURNS TABLE(used_bytes bigint, asset_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(a.size_bytes), 0)::bigint AS used_bytes,
    COUNT(*)::bigint AS asset_count
  FROM public.assets a;
$$;

-- Ensure live DBs pick up the function even when table already existed
COMMENT ON FUNCTION public.get_assets_storage_stats() IS
  'SUM(size_bytes)+COUNT(*) over public.assets for admin storage bar';

REVOKE ALL ON FUNCTION public.get_assets_storage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assets_storage_stats() TO service_role;
CREATE INDEX IF NOT EXISTS idx_assets_release_id  ON public.assets (release_id);
CREATE INDEX IF NOT EXISTS idx_assets_press_approved ON public.assets (is_press_approved) WHERE is_press_approved = TRUE;
CREATE INDEX IF NOT EXISTS idx_assets_press_suggested ON public.assets (press_suggested) WHERE press_suggested = TRUE;

-- ---------------------------------------------------------------------------
-- TABLE: asset_artists  (many-to-many: one asset can belong to multiple artists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_artists (
  asset_id  UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, artist_id)
);
CREATE INDEX IF NOT EXISTS idx_asset_artists_asset_id  ON public.asset_artists(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_artists_artist_id ON public.asset_artists(artist_id);

-- ---------------------------------------------------------------------------
-- TABLE: press_kit_items  (curated press kit membership per artist)
-- artist_id NULL = label-wide kit entry visible on all artist EPK pages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.press_kit_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  artist_id     UUID        REFERENCES public.artists(id) ON DELETE CASCADE,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_press_kit_items_artist_order
  ON public.press_kit_items (artist_id, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_press_kit_items_asset_id
  ON public.press_kit_items (asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_press_kit_items_asset_label
  ON public.press_kit_items (asset_id) WHERE artist_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_press_kit_items_asset_artist
  ON public.press_kit_items (asset_id, artist_id) WHERE artist_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: site_settings  (CMS key-value store)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_site_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_site_settings_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: user_invites
-- Durable admin invite tokens. Validity is controlled by
-- site_settings.invite_link_expiry_hours (24–168h, default 168).
-- Only the SHA-256 hash of the emailed token is stored.
-- Access: service-role only (RLS on, no policies).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL,
  token_hash   TEXT        NOT NULL UNIQUE,
  portal       BOOLEAN     NOT NULL DEFAULT FALSE,
  artist_id    UUID        REFERENCES public.artists (id) ON DELETE SET NULL,
  granted_by   UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  auth_user_id UUID        REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_invites_email ON public.user_invites (email);
CREATE INDEX IF NOT EXISTS idx_user_invites_auth_user_id ON public.user_invites (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_expires_at ON public.user_invites (expires_at);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- TABLE: api_credentials  (admin-managed external API keys, AES-256-GCM ciphertext)
-- label_id 00000000-0000-0000-0000-000000000000 = default single-label tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_credentials (
  label_id   UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  key        TEXT        NOT NULL,
  value      TEXT        NOT NULL DEFAULT '',
  category   TEXT        NOT NULL DEFAULT 'integration',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  PRIMARY KEY (label_id, key)
);

ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS label_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'integration';

-- Migrate legacy single-column PK (key-only) to composite PK when upgrading existing DBs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.api_credentials'::regclass
      AND c.contype = 'p'
      AND a.attname = 'key'
      AND array_length(c.conkey, 1) = 1
  ) THEN
    ALTER TABLE public.api_credentials DROP CONSTRAINT api_credentials_pkey;
    UPDATE public.api_credentials SET label_id = '00000000-0000-0000-0000-000000000000' WHERE label_id IS NULL;
    ALTER TABLE public.api_credentials ADD PRIMARY KEY (label_id, key);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Normalize NULL label_id rows and enforce NOT NULL (PK columns cannot be NULL in PostgreSQL).
UPDATE public.api_credentials
SET label_id = '00000000-0000-0000-0000-000000000000'
WHERE label_id IS NULL;

ALTER TABLE public.api_credentials
  ALTER COLUMN label_id SET DEFAULT '00000000-0000-0000-0000-000000000000',
  ALTER COLUMN label_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_api_credentials_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_api_credentials_updated_at ON public.api_credentials;
CREATE TRIGGER trg_api_credentials_updated_at
  BEFORE UPDATE ON public.api_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_api_credentials_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: sync_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id               UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id        UUID               REFERENCES public.artists (id) ON DELETE CASCADE,
  status           public.sync_status NOT NULL,
  message          TEXT,
  releases_synced  INTEGER            NOT NULL DEFAULT 0,
  errors           JSONB              NOT NULL DEFAULT '[]',
  api_source       TEXT               NOT NULL DEFAULT 'itunes',
  rate_limited     BOOLEAN            NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS api_source   TEXT    NOT NULL DEFAULT 'itunes';
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS rate_limited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS duration_ms  INTEGER;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS metadata     JSONB   NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_sync_logs_artist_id  ON public.sync_logs (artist_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON public.sync_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: concerts  (Songkick / Bandsintown live events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID        REFERENCES public.artists (id) ON DELETE CASCADE,
  event_name      TEXT        NOT NULL,
  venue_name      TEXT,
  venue_address   TEXT,
  venue_city      TEXT,
  venue_country   TEXT,
  concert_date    DATE        NOT NULL,
  event_time      TIME,
  event_type      TEXT        NOT NULL DEFAULT 'gig',
  ticket_url      TEXT,
  trailer_url     TEXT,
  venue_lat       FLOAT8,
  venue_lng       FLOAT8,
  venue_osm_id    TEXT,
  songkick_id     TEXT        UNIQUE,
  bandsintown_id  TEXT        UNIQUE,
  news_post_id    UUID        REFERENCES public.news_posts (id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'ok',
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  source          TEXT        NOT NULL DEFAULT 'admin',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS bandsintown_id TEXT UNIQUE;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS event_time TIME;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'gig';
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS trailer_url TEXT;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS venue_lat FLOAT8;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS venue_lng FLOAT8;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS venue_osm_id TEXT;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS news_post_id UUID REFERENCES public.news_posts(id) ON DELETE SET NULL;
ALTER TABLE public.concerts ADD COLUMN IF NOT EXISTS venue_address TEXT;

CREATE INDEX IF NOT EXISTS idx_concerts_artist_id    ON public.concerts (artist_id);
CREATE INDEX IF NOT EXISTS idx_concerts_concert_date ON public.concerts (concert_date ASC);
CREATE INDEX IF NOT EXISTS idx_concerts_news_post    ON public.concerts (news_post_id);

-- ---------------------------------------------------------------------------
-- TABLE: concert_artists  (featured/supporting artists for a concert)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.concert_artists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id  UUID NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  sort_order  INT  NOT NULL DEFAULT 0,
  UNIQUE (concert_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_concert_artists_concert ON public.concert_artists (concert_id);
CREATE INDEX IF NOT EXISTS idx_concert_artists_artist  ON public.concert_artists (artist_id);

-- ---------------------------------------------------------------------------
-- TRACK Tour Planner — tours, stops, contacts, tasks, crew, merch
-- Parallel to concerts (public events); optional link via tour_stops.concert_id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  start_date      DATE,
  end_date        DATE,
  archived        BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order      INT         NOT NULL DEFAULT 0,
  settings        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  route_cache     JSONB,
  budget          JSONB,
  tech_documents  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  currency        TEXT        NOT NULL DEFAULT 'EUR',
  total_budget    NUMERIC,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tours_artist_id ON public.tours (artist_id);
CREATE INDEX IF NOT EXISTS idx_tours_archived  ON public.tours (artist_id, archived);

-- Public read-only share links for tours (logistics + deal framework)
CREATE TABLE IF NOT EXISTS public.tour_share_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id     UUID        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  label       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_by  UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tour_share_links_tour_id ON public.tour_share_links (tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_share_links_token ON public.tour_share_links (token);
CREATE INDEX IF NOT EXISTS idx_tour_share_links_artist_id ON public.tour_share_links (artist_id);

ALTER TABLE public.tour_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour_share_links: artist manage" ON public.tour_share_links;
CREATE POLICY "tour_share_links: artist manage" ON public.tour_share_links
  FOR ALL TO authenticated
  USING (
    artist_id IN (SELECT am.artist_id FROM public.artist_members am WHERE am.user_id = auth.uid())
    OR public.has_permission('can_view_admin_panel')
    OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    artist_id IN (SELECT am.artist_id FROM public.artist_members am WHERE am.user_id = auth.uid())
    OR public.has_permission('can_view_admin_panel')
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "tour_share_links: admin all" ON public.tour_share_links;
CREATE POLICY "tour_share_links: admin all" ON public.tour_share_links
  FOR ALL TO authenticated
  USING (public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin')
  WITH CHECK (public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin');

CREATE TABLE IF NOT EXISTS public.tour_stops (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id             UUID        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  artist_id           UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  concert_id          UUID        REFERENCES public.concerts (id) ON DELETE SET NULL,
  sort_order          INT         NOT NULL DEFAULT 0,
  stop_date           DATE        NOT NULL,
  is_travel_day       BOOLEAN     NOT NULL DEFAULT FALSE,
  venue_name          TEXT,
  venue_address       TEXT,
  venue_city          TEXT,
  venue_country       TEXT,
  venue_lat           FLOAT8,
  venue_lng           FLOAT8,
  venue_validated     BOOLEAN     NOT NULL DEFAULT FALSE,
  hotel_name          TEXT,
  hotel_address       TEXT,
  hotel_city          TEXT,
  hotel_country       TEXT,
  hotel_lat           FLOAT8,
  hotel_lng           FLOAT8,
  hotel_validated     BOOLEAN     NOT NULL DEFAULT FALSE,
  arrival_time        TEXT,
  show_status         TEXT        NOT NULL DEFAULT 'option',
  day_schedule        JSONB,
  deal                JSONB,
  settlement          JSONB,
  per_diems           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rooming             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  travel_manifest     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  venue_details       JSONB,
  venue_contact_info  JSONB,
  guest_list          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  guest_list_limit    INT,
  notes               TEXT,
  external_guest_notes TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tour_stops ADD COLUMN IF NOT EXISTS external_guest_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_tour_stops_tour_id    ON public.tour_stops (tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_stops_artist_id  ON public.tour_stops (artist_id);
CREATE INDEX IF NOT EXISTS idx_tour_stops_concert_id ON public.tour_stops (concert_id);
CREATE INDEX IF NOT EXISTS idx_tour_stops_stop_date  ON public.tour_stops (stop_date);

CREATE TABLE IF NOT EXISTS public.tour_contacts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id         UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  contact_type      TEXT        NOT NULL DEFAULT 'promoter',
  name              TEXT        NOT NULL,
  company           TEXT,
  email             TEXT,
  phone             TEXT,
  address           TEXT,
  city              TEXT,
  country           TEXT,
  last_contact_date DATE,
  notes             TEXT,
  previous_deals    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_contacts_artist_id ON public.tour_contacts (artist_id);

CREATE TABLE IF NOT EXISTS public.tour_tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  tour_id       UUID        REFERENCES public.tours (id) ON DELETE CASCADE,
  stop_id       UUID        REFERENCES public.tour_stops (id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  due_date      DATE        NOT NULL,
  priority      TEXT        NOT NULL DEFAULT 'medium',
  completed     BOOLEAN     NOT NULL DEFAULT FALSE,
  assigned_to   TEXT,
  task_type     TEXT        NOT NULL DEFAULT 'other',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_tasks_artist_id ON public.tour_tasks (artist_id);
CREATE INDEX IF NOT EXISTS idx_tour_tasks_tour_id   ON public.tour_tasks (tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_tasks_stop_id   ON public.tour_tasks (stop_id);

CREATE TABLE IF NOT EXISTS public.tour_crew_members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id             UUID        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  artist_id           UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  role                TEXT        NOT NULL DEFAULT '',
  email               TEXT,
  phone               TEXT,
  passport_number     TEXT,
  passport_expiry     DATE,
  passport_issue_place TEXT,
  date_of_birth       DATE,
  nationality         TEXT,
  visa_info           TEXT,
  room_assignment     TEXT,
  bus_assignment      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_crew_tour_id   ON public.tour_crew_members (tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_crew_artist_id ON public.tour_crew_members (artist_id);

CREATE TABLE IF NOT EXISTS public.tour_merch_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  sku         TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'soft',
  variants    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  base_price  NUMERIC     NOT NULL DEFAULT 0,
  currency    TEXT        NOT NULL DEFAULT 'EUR',
  box         TEXT,
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_tour_merch_items_artist_id ON public.tour_merch_items (artist_id);

CREATE TABLE IF NOT EXISTS public.tour_merch_settlements (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id      UUID        NOT NULL REFERENCES public.tour_stops (id) ON DELETE CASCADE,
  artist_id    UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  settlement   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stop_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_merch_settlements_stop_id ON public.tour_merch_settlements (stop_id);
CREATE INDEX IF NOT EXISTS idx_tour_merch_settlements_artist_id ON public.tour_merch_settlements (artist_id);

-- Co-tour collaborators (any roster artist may be invited to co-manage)
CREATE TABLE IF NOT EXISTS public.tour_collaborators (
  tour_id     UUID        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  invited_by  UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tour_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_collaborators_artist_id ON public.tour_collaborators (artist_id);

-- Per-stop co-headline roster artists (subset of tour collaborators)
CREATE TABLE IF NOT EXISTS public.tour_stop_performing_artists (
  stop_id     UUID        NOT NULL REFERENCES public.tour_stops (id) ON DELETE CASCADE,
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stop_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_stop_performing_artists_stop_id ON public.tour_stop_performing_artists (stop_id);

-- Private per-artist stop data (deal, settlement — never shared with collaborators)
CREATE TABLE IF NOT EXISTS public.tour_stop_artist_private (
  stop_id        UUID        NOT NULL REFERENCES public.tour_stops (id) ON DELETE CASCADE,
  artist_id      UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  deal           JSONB,
  settlement     JSONB,
  private_notes  TEXT,
  version        INT         NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stop_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_stop_artist_private_artist_id ON public.tour_stop_artist_private (artist_id);

-- Private per-artist tour budget
CREATE TABLE IF NOT EXISTS public.tour_artist_finance (
  tour_id        UUID        NOT NULL REFERENCES public.tours (id) ON DELETE CASCADE,
  artist_id      UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  budget         JSONB,
  total_budget   NUMERIC,
  currency       TEXT        NOT NULL DEFAULT 'EUR',
  version        INT         NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tour_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_artist_finance_artist_id ON public.tour_artist_finance (artist_id);

-- Backfill private stop data from legacy columns
INSERT INTO public.tour_stop_artist_private (stop_id, artist_id, deal, settlement, private_notes)
SELECT s.id, s.artist_id, s.deal, s.settlement, s.notes
FROM public.tour_stops s
WHERE (s.deal IS NOT NULL OR s.settlement IS NOT NULL OR s.notes IS NOT NULL)
ON CONFLICT (stop_id, artist_id) DO NOTHING;

-- Backfill tour finance for tour owners
INSERT INTO public.tour_artist_finance (tour_id, artist_id, budget, total_budget, currency)
SELECT t.id, t.artist_id, t.budget, t.total_budget, t.currency
FROM public.tours t
WHERE t.budget IS NOT NULL OR t.total_budget IS NOT NULL
ON CONFLICT (tour_id, artist_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_tour_stop_artist_private_updated_at ON public.tour_stop_artist_private;
CREATE TRIGGER trg_tour_stop_artist_private_updated_at
  BEFORE UPDATE ON public.tour_stop_artist_private
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_artist_finance_updated_at ON public.tour_artist_finance;
CREATE TRIGGER trg_tour_artist_finance_updated_at
  BEFORE UPDATE ON public.tour_artist_finance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tours_updated_at ON public.tours;
CREATE TRIGGER trg_tours_updated_at
  BEFORE UPDATE ON public.tours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_stops_updated_at ON public.tour_stops;
CREATE TRIGGER trg_tour_stops_updated_at
  BEFORE UPDATE ON public.tour_stops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_contacts_updated_at ON public.tour_contacts;
CREATE TRIGGER trg_tour_contacts_updated_at
  BEFORE UPDATE ON public.tour_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_tasks_updated_at ON public.tour_tasks;
CREATE TRIGGER trg_tour_tasks_updated_at
  BEFORE UPDATE ON public.tour_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_crew_members_updated_at ON public.tour_crew_members;
CREATE TRIGGER trg_tour_crew_members_updated_at
  BEFORE UPDATE ON public.tour_crew_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_merch_items_updated_at ON public.tour_merch_items;
CREATE TRIGGER trg_tour_merch_items_updated_at
  BEFORE UPDATE ON public.tour_merch_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tour_merch_settlements_updated_at ON public.tour_merch_settlements;
CREATE TRIGGER trg_tour_merch_settlements_updated_at
  BEFORE UPDATE ON public.tour_merch_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_merch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_merch_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_stop_performing_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_stop_artist_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_artist_finance ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_tour(p_tour_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tours t
    WHERE t.id = p_tour_id
      AND (
        t.artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.tour_collaborators tc
          WHERE tc.tour_id = p_tour_id
            AND tc.artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_tour(p_tour_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tours t
    WHERE t.id = p_tour_id
      AND t.artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );
$$;

DROP POLICY IF EXISTS "tours: artist manage" ON public.tours;
CREATE POLICY "tours: artist manage" ON public.tours
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    OR public.user_can_access_tour(id)
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    OR public.user_can_access_tour(id)
  );

DROP POLICY IF EXISTS "tours: admin all" ON public.tours;
CREATE POLICY "tours: admin all" ON public.tours
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_stops: artist manage" ON public.tour_stops;
CREATE POLICY "tour_stops: artist manage" ON public.tour_stops
  FOR ALL USING (public.user_can_access_tour(tour_id))
  WITH CHECK (public.user_can_access_tour(tour_id));

DROP POLICY IF EXISTS "tour_stops: admin all" ON public.tour_stops;
CREATE POLICY "tour_stops: admin all" ON public.tour_stops
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_contacts: artist manage" ON public.tour_contacts;
CREATE POLICY "tour_contacts: artist manage" ON public.tour_contacts
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tour_contacts: admin all" ON public.tour_contacts;
CREATE POLICY "tour_contacts: admin all" ON public.tour_contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_tasks: artist manage" ON public.tour_tasks;
CREATE POLICY "tour_tasks: artist manage" ON public.tour_tasks
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    OR (tour_id IS NOT NULL AND public.user_can_access_tour(tour_id))
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    OR (tour_id IS NOT NULL AND public.user_can_access_tour(tour_id))
  );

DROP POLICY IF EXISTS "tour_tasks: admin all" ON public.tour_tasks;
CREATE POLICY "tour_tasks: admin all" ON public.tour_tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_crew: artist manage" ON public.tour_crew_members;
CREATE POLICY "tour_crew: artist manage" ON public.tour_crew_members
  FOR ALL USING (public.user_can_access_tour(tour_id))
  WITH CHECK (public.user_can_access_tour(tour_id));

DROP POLICY IF EXISTS "tour_crew: admin all" ON public.tour_crew_members;
CREATE POLICY "tour_crew: admin all" ON public.tour_crew_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_merch_items: artist manage" ON public.tour_merch_items;
CREATE POLICY "tour_merch_items: artist manage" ON public.tour_merch_items
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tour_merch_items: admin all" ON public.tour_merch_items;
CREATE POLICY "tour_merch_items: admin all" ON public.tour_merch_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_merch_settlements: artist manage" ON public.tour_merch_settlements;
CREATE POLICY "tour_merch_settlements: artist manage" ON public.tour_merch_settlements
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tour_merch_settlements: admin all" ON public.tour_merch_settlements;
CREATE POLICY "tour_merch_settlements: admin all" ON public.tour_merch_settlements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_collaborators: read" ON public.tour_collaborators;
CREATE POLICY "tour_collaborators: read" ON public.tour_collaborators
  FOR SELECT USING (public.user_can_access_tour(tour_id));

DROP POLICY IF EXISTS "tour_collaborators: owner manage" ON public.tour_collaborators;
CREATE POLICY "tour_collaborators: owner manage" ON public.tour_collaborators
  FOR INSERT WITH CHECK (public.user_owns_tour(tour_id));

DROP POLICY IF EXISTS "tour_collaborators: owner delete" ON public.tour_collaborators;
CREATE POLICY "tour_collaborators: owner delete" ON public.tour_collaborators
  FOR DELETE USING (public.user_owns_tour(tour_id));

DROP POLICY IF EXISTS "tour_stop_performing_artists: tour access" ON public.tour_stop_performing_artists;
CREATE POLICY "tour_stop_performing_artists: tour access" ON public.tour_stop_performing_artists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tour_stops ts
      WHERE ts.id = stop_id AND public.user_can_access_tour(ts.tour_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tour_stops ts
      WHERE ts.id = stop_id AND public.user_can_access_tour(ts.tour_id)
    )
  );

DROP POLICY IF EXISTS "tour_stop_artist_private: own artist" ON public.tour_stop_artist_private;
CREATE POLICY "tour_stop_artist_private: own artist" ON public.tour_stop_artist_private
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tour_stops ts
      WHERE ts.id = stop_id AND public.user_can_access_tour(ts.tour_id)
    )
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tour_stops ts
      WHERE ts.id = stop_id AND public.user_can_access_tour(ts.tour_id)
    )
  );

DROP POLICY IF EXISTS "tour_artist_finance: own artist" ON public.tour_artist_finance;
CREATE POLICY "tour_artist_finance: own artist" ON public.tour_artist_finance
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    AND public.user_can_access_tour(tour_id)
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
    AND public.user_can_access_tour(tour_id)
  );

DROP POLICY IF EXISTS "tour_collaborators: admin all" ON public.tour_collaborators;
CREATE POLICY "tour_collaborators: admin all" ON public.tour_collaborators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_stop_performing_artists: admin all" ON public.tour_stop_performing_artists;
CREATE POLICY "tour_stop_performing_artists: admin all" ON public.tour_stop_performing_artists
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_stop_artist_private: admin all" ON public.tour_stop_artist_private;
CREATE POLICY "tour_stop_artist_private: admin all" ON public.tour_stop_artist_private
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

DROP POLICY IF EXISTS "tour_artist_finance: admin all" ON public.tour_artist_finance;
CREATE POLICY "tour_artist_finance: admin all" ON public.tour_artist_finance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'editor'))
  );

ALTER TABLE public.concert_artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "concert_artists: public read" ON public.concert_artists;
CREATE POLICY "concert_artists: public read" ON public.concert_artists
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "concert_artists: artist manage" ON public.concert_artists;
CREATE POLICY "concert_artists: artist manage" ON public.concert_artists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.concerts c
      JOIN public.artist_members am ON am.artist_id = c.artist_id
      WHERE c.id = concert_id AND am.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.concerts c
      JOIN public.artist_members am ON am.artist_id = c.artist_id
      WHERE c.id = concert_id AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "concert_artists: admin all" ON public.concert_artists;
CREATE POLICY "concert_artists: admin all" ON public.concert_artists
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- TABLE: editor_activity_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.editor_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  editor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_editor_activity_log_editor_id ON public.editor_activity_log(editor_id);
CREATE INDEX IF NOT EXISTS idx_editor_activity_log_created_at ON public.editor_activity_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: editor_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.editor_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_editor_notifications_recipient
  ON public.editor_notifications(recipient_id, read);

-- ---------------------------------------------------------------------------
-- TABLE: notifications  (unified staff + artist in-app notifications)
-- Prefer this over editor_notifications for all new emits.
-- editor_notifications remains for legacy rows until fully migrated.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES public.artists(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications(user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_artist
  ON public.notifications(artist_id, created_at DESC)
  WHERE artist_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: notification_preferences (per-user channel toggles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON public.notification_preferences(user_id);

-- ---------------------------------------------------------------------------
-- TABLE: interview_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journalist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  preferred_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  artist_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_requests_journalist ON public.interview_requests(journalist_id);
CREATE INDEX IF NOT EXISTS idx_interview_requests_artist ON public.interview_requests(artist_id);

DROP TRIGGER IF EXISTS trg_concerts_updated_at ON public.concerts;
CREATE TRIGGER trg_concerts_updated_at
  BEFORE UPDATE ON public.concerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  ALTER TABLE public.artist_profiles RENAME TO artist_epks;
EXCEPTION WHEN undefined_table THEN NULL;
          WHEN duplicate_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- TABLE: artist_epks  (EPK data — artist-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_epks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id      UUID        NOT NULL UNIQUE REFERENCES public.artists (id) ON DELETE CASCADE,
  bio_short      TEXT,
  bio_medium     TEXT,
  bio_long       TEXT,
  -- Simon: Gibt es einen Grund ein extra Foto mit ins EPK zu nehmen? Könnte man nicht einfach das Foto der Band nehmen?
  -- photo_url      TEXT,
  press_quote    TEXT,
  epk_gallery_photos      TEXT[]  NOT NULL DEFAULT '{}',
  epk_custom_theme_tokens JSONB            DEFAULT NULL,
  custom_links            JSONB            DEFAULT NULL,
  -- Contact details for booking and press inquiries
  booking_contact         TEXT,
  press_contact           TEXT,
  -- Technical/stage rider documents (R2 URLs)
  rider_stage_plot_url    TEXT,
  rider_technical_url     TEXT,
  rider_hospitality_url   TEXT,
  -- Onboarding and EPK customisation
  onboarding_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  epk_theme               TEXT    NOT NULL DEFAULT 'default',
  epk_layout              TEXT    NOT NULL DEFAULT 'classic',
  epk_orientation         TEXT    NOT NULL DEFAULT 'portrait',
  epk_bg_image_url        TEXT,
  epk_bg_opacity          INTEGER NOT NULL DEFAULT 20,
  epk_sections_order      TEXT[]  NOT NULL DEFAULT ARRAY['header','quote','bio','info','contacts','riders','links'],
  epk_sections_hidden     TEXT[]  NOT NULL DEFAULT '{}',
  -- Password-protect sensitive EPK sections
  epk_password_hash       TEXT,
  epk_password_sections   TEXT[]  NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent guards for columns added after initial schema creation.
-- All columns listed here MUST have a guard so that existing databases are updated
-- safely when running this script (CREATE TABLE IF NOT EXISTS is a no-op on existing
-- tables, so guards are the only way to add new columns to live databases).
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS bio_short               TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS bio_medium              TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS bio_long                TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS press_quote             TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_gallery_photos      TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_custom_theme_tokens JSONB            DEFAULT NULL;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS custom_links            JSONB            DEFAULT NULL;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS booking_contact       TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS press_contact         TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS rider_stage_plot_url  TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS rider_technical_url   TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS rider_hospitality_url TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE;
-- EPK Theme & Section customisation
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_theme             TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_layout            TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_orientation       TEXT NOT NULL DEFAULT 'portrait';
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_bg_image_url      TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_bg_opacity        INTEGER NOT NULL DEFAULT 20;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_sections_order    TEXT[] NOT NULL DEFAULT ARRAY['header','quote','bio','info','contacts','riders','links'];
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_sections_hidden   TEXT[] NOT NULL DEFAULT '{}';
-- EPK Password protection for sensitive sections
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_password_hash     TEXT;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_password_sections TEXT[] NOT NULL DEFAULT '{}';
-- EPK Canvas Builder (v2 document JSON)
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_document          JSONB;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_document_version  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.artist_epks ADD COLUMN IF NOT EXISTS epk_editor_mode       TEXT NOT NULL DEFAULT 'legacy';

COMMENT ON COLUMN public.artist_epks.epk_document IS
  'EPK Canvas document JSON (schema version 2) — Konva editor state.';
COMMENT ON COLUMN public.artist_epks.epk_editor_mode IS
  'EPK editor mode: legacy (HTML presets) or canvas (Konva builder).';

-- ---------------------------------------------------------------------------
-- TABLE: epk_versions  (EPK document version history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epk_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  document        JSONB       NOT NULL,
  version_number  INTEGER     NOT NULL,
  label           TEXT,
  created_by      UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epk_versions_artist_id ON public.epk_versions (artist_id);
CREATE INDEX IF NOT EXISTS idx_epk_versions_created_at ON public.epk_versions (artist_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_epk_versions_artist_version
  ON public.epk_versions (artist_id, version_number);

-- ---------------------------------------------------------------------------
-- TABLE: epk_fonts  (custom fonts for EPK canvas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epk_fonts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID        REFERENCES public.artists (id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  r2_key          TEXT        NOT NULL,
  mime_type       TEXT        NOT NULL DEFAULT 'font/woff2',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epk_fonts_artist_id ON public.epk_fonts (artist_id);

-- ---------------------------------------------------------------------------
-- TABLE: epk_share_links  (tokenized public EPK share URLs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epk_share_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  token           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT,
  expires_at      TIMESTAMPTZ,
  label           TEXT,
  created_by      UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_epk_share_links_token ON public.epk_share_links (token);
CREATE INDEX IF NOT EXISTS idx_epk_share_links_artist_id ON public.epk_share_links (artist_id);

-- ---------------------------------------------------------------------------
-- TABLE: epk_download_events  (EPK PDF download analytics)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epk_download_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  source        TEXT        NOT NULL CHECK (source IN ('portal', 'share', 'press')),
  share_link_id UUID        REFERENCES public.epk_share_links (id) ON DELETE SET NULL,
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epk_download_events_artist_id ON public.epk_download_events (artist_id);
CREATE INDEX IF NOT EXISTS idx_epk_download_events_created_at ON public.epk_download_events (artist_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: epk_templates  (admin brand guideline / starter templates)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epk_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  document     JSONB       NOT NULL,
  is_published BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epk_templates_published ON public.epk_templates (is_published, sort_order);

DROP TRIGGER IF EXISTS trg_epk_templates_updated_at ON public.epk_templates;
CREATE TRIGGER trg_epk_templates_updated_at
  BEFORE UPDATE ON public.epk_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: artist_landing_pages  (fan-facing customizable landing page, 1:1 per artist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_landing_pages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id           UUID        NOT NULL UNIQUE REFERENCES public.artists (id) ON DELETE CASCADE,
  document            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  document_version    INTEGER     NOT NULL DEFAULT 0,
  template_id         TEXT,
  publish_status      TEXT        NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'pending_review', 'published', 'rejected')),
  seo_title           TEXT,
  seo_description     TEXT,
  og_image_asset_id   UUID        REFERENCES public.assets (id) ON DELETE SET NULL,
  published_at        TIMESTAMPTZ,
  reviewed_by         UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_comment      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_landing_pages_artist_id
  ON public.artist_landing_pages (artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_landing_pages_published
  ON public.artist_landing_pages (publish_status)
  WHERE publish_status = 'published';

DROP TRIGGER IF EXISTS trg_artist_landing_pages_updated_at ON public.artist_landing_pages;
CREATE TRIGGER trg_artist_landing_pages_updated_at
  BEFORE UPDATE ON public.artist_landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS landing_publish_trusted BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.artist_epks.epk_gallery_photos IS
  'Array of R2 URLs for additional press/EPK gallery photos.';
COMMENT ON COLUMN public.artist_epks.epk_custom_theme_tokens IS
  'JSON object with custom EPK color tokens: { bg, text, accent, heading }.';
CREATE INDEX IF NOT EXISTS idx_artist_profiles_artist_id ON public.artist_epks (artist_id);

DROP TRIGGER IF EXISTS trg_artist_profiles_updated_at ON public.artist_epks;
CREATE TRIGGER trg_artist_profiles_updated_at
  BEFORE UPDATE ON public.artist_epks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: streaming_stats  (monthly platform stream counts per artist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.streaming_stats (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  platform    TEXT        NOT NULL,
  period      TEXT        NOT NULL,
  streams     BIGINT      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, platform, period)
);

CREATE INDEX IF NOT EXISTS idx_streaming_stats_artist_id ON public.streaming_stats (artist_id);
CREATE INDEX IF NOT EXISTS idx_streaming_stats_period    ON public.streaming_stats (period DESC);

-- ---------------------------------------------------------------------------
-- TABLE: sales_statements  (royalty PDFs stored in R2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_statements (
  id                 UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id          UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  filename           TEXT           NOT NULL,
  r2_key             TEXT           NOT NULL UNIQUE,
  period             TEXT           NOT NULL,
  amount_eur         NUMERIC(10, 2),
  status             TEXT           NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'label_approved', 'artist_notified', 'acknowledged')),
  label_notes        TEXT,
  label_approved_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_statements_artist_id  ON public.sales_statements (artist_id);
CREATE INDEX IF NOT EXISTS idx_sales_statements_created_at ON public.sales_statements (created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: sos_rules_presets  — named rule-set presets for SOS accounting
-- Must exist before distributor_import_batches (FK rules_preset_id).
-- RLS/policies are applied later in the SOS section.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_rules_presets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  config     JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sos_rules_presets_name_ci
  ON public.sos_rules_presets (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- TABLE: distributor_import_batches  (Bronze metadata — raw CSV in R2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distributor_import_batches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    TEXT        NOT NULL,
  period_end      TEXT        NOT NULL,
  distributor     TEXT        NOT NULL,
  r2_key          TEXT        NOT NULL UNIQUE,
  file_hash       TEXT,
  row_count       INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  rules_preset_id UUID        REFERENCES public.sos_rules_presets (id) ON DELETE SET NULL,
  uploaded_by     UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributor_import_batches_period
  ON public.distributor_import_batches (period_start DESC);

-- ---------------------------------------------------------------------------
-- TABLE: artist_territory_metrics  (Gold — monthly streams/revenue per territory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_territory_metrics (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  period          TEXT           NOT NULL,
  platform        TEXT           NOT NULL DEFAULT '',
  country         TEXT           NOT NULL DEFAULT '',
  streams         BIGINT         NOT NULL DEFAULT 0,
  revenue_eur     NUMERIC(14, 4) NOT NULL DEFAULT 0,
  quantity        BIGINT         NOT NULL DEFAULT 0,
  source_batch_id UUID           REFERENCES public.distributor_import_batches (id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, period, platform, country)
);

CREATE INDEX IF NOT EXISTS idx_artist_territory_metrics_artist_period
  ON public.artist_territory_metrics (artist_id, period DESC);

-- ---------------------------------------------------------------------------
-- TABLE: sales_statement_line_items  (Gold — SOS detail rows per statement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_statement_line_items (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID           NOT NULL REFERENCES public.sales_statements (id) ON DELETE CASCADE,
  release_id   UUID           REFERENCES public.releases (id) ON DELETE SET NULL,
  platform     TEXT,
  country      TEXT,
  streams      BIGINT         NOT NULL DEFAULT 0,
  revenue_eur  NUMERIC(14, 4) NOT NULL DEFAULT 0,
  quantity     BIGINT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_statement_line_items_statement
  ON public.sales_statement_line_items (statement_id);

-- ---------------------------------------------------------------------------
-- TABLE: event_impact  (Gold — precomputed concert ↔ territory correlation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_impact (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id      UUID           NOT NULL REFERENCES public.concerts (id) ON DELETE CASCADE,
  artist_id       UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  country         TEXT           NOT NULL,
  window_days     INTEGER        NOT NULL DEFAULT 30,
  streams_before  BIGINT         NOT NULL DEFAULT 0,
  streams_after   BIGINT         NOT NULL DEFAULT 0,
  delta_streams   BIGINT         NOT NULL DEFAULT 0,
  delta_pct       NUMERIC(8, 2)  NOT NULL DEFAULT 0,
  revenue_before  NUMERIC(14, 4) NOT NULL DEFAULT 0,
  revenue_after   NUMERIC(14, 4) NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (concert_id, country, window_days)
);

CREATE INDEX IF NOT EXISTS idx_event_impact_artist
  ON public.event_impact (artist_id);

-- ---------------------------------------------------------------------------
-- TABLE: promo_log_entries
-- Label-documented marketing activities (timeline for linked artists).
-- Must exist before promo_impact (FK promo_log_id). RLS applied later.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_log_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id        UUID           NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  action_date      DATE           NOT NULL,
  description      TEXT           NOT NULL,
  budget_amount    NUMERIC(12, 2),
  budget_currency  TEXT           NOT NULL DEFAULT 'EUR',
  proof_url        TEXT,
  proof_r2_key     TEXT,
  created_by       UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_log_artist_id ON public.promo_log_entries (artist_id, action_date DESC);

-- ---------------------------------------------------------------------------
-- TABLE: promo_impact  (Gold — precomputed promo log ↔ stream correlation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_impact (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_log_id    UUID           NOT NULL REFERENCES public.promo_log_entries (id) ON DELETE CASCADE,
  artist_id       UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  window_days     INTEGER        NOT NULL DEFAULT 30,
  streams_before  BIGINT         NOT NULL DEFAULT 0,
  streams_after   BIGINT         NOT NULL DEFAULT 0,
  delta_streams   BIGINT         NOT NULL DEFAULT 0,
  delta_pct       NUMERIC(8, 2)  NOT NULL DEFAULT 0,
  revenue_before  NUMERIC(14, 4) NOT NULL DEFAULT 0,
  revenue_after   NUMERIC(14, 4) NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (promo_log_id, window_days)
);

CREATE INDEX IF NOT EXISTS idx_promo_impact_artist
  ON public.promo_impact (artist_id);

-- ---------------------------------------------------------------------------
-- TABLE: page_events  (website engagement — consent-gated, API-inserted)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT        NOT NULL CHECK (event_type IN ('page_view', 'shop_click', 'smart_link_click', 'news_view')),
  path           TEXT        NOT NULL,
  artist_id      UUID        REFERENCES public.artists (id) ON DELETE SET NULL,
  news_post_id   UUID        REFERENCES public.news_posts (id) ON DELETE SET NULL,
  release_id     UUID        REFERENCES public.releases (id) ON DELETE SET NULL,
  referrer_host  TEXT,
  session_hash   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_events_artist_created
  ON public.page_events (artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_events_type_created
  ON public.page_events (event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: merch_orders  (Gold — normalised Shopify / Darkmerch line items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merch_orders (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id       UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  source          TEXT           NOT NULL CHECK (source IN ('shopify', 'darkmerch')),
  external_id     TEXT           NOT NULL,
  period          TEXT           NOT NULL,
  product_title   TEXT           NOT NULL DEFAULT '',
  country         TEXT           NOT NULL DEFAULT '',
  quantity        INTEGER        NOT NULL DEFAULT 0,
  revenue_eur     NUMERIC(14, 4) NOT NULL DEFAULT 0,
  source_batch_id UUID           REFERENCES public.distributor_import_batches (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_merch_orders_artist_period
  ON public.merch_orders (artist_id, period DESC);

-- ---------------------------------------------------------------------------
-- TABLE: artist_listener_metrics  (Gold — external listener/play trends)
-- Sources: Last.fm (free), Soundcharts (optional), Apify Spotify public scrapes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_listener_metrics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  source      TEXT        NOT NULL CHECK (source IN ('lastfm', 'soundcharts', 'apify')),
  metric_type TEXT        NOT NULL CHECK (metric_type IN ('listeners', 'plays', 'followers')),
  period      TEXT        NOT NULL,
  value       BIGINT      NOT NULL DEFAULT 0,
  country     TEXT        NOT NULL DEFAULT '',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, source, metric_type, period, country)
);

CREATE INDEX IF NOT EXISTS idx_artist_listener_metrics_artist_period
  ON public.artist_listener_metrics (artist_id, period DESC);

-- Idempotent CHECK expansion for existing databases created with older CHECKs
ALTER TABLE public.artist_listener_metrics
  DROP CONSTRAINT IF EXISTS artist_listener_metrics_source_check;
ALTER TABLE public.artist_listener_metrics
  ADD CONSTRAINT artist_listener_metrics_source_check
  CHECK (source IN ('lastfm', 'soundcharts', 'apify'));
ALTER TABLE public.artist_listener_metrics
  DROP CONSTRAINT IF EXISTS artist_listener_metrics_metric_type_check;
ALTER TABLE public.artist_listener_metrics
  ADD CONSTRAINT artist_listener_metrics_metric_type_check
  CHECK (metric_type IN ('listeners', 'plays', 'followers'));

-- ---------------------------------------------------------------------------
-- TABLE: spotify_track_play_snapshots  (Apify public track play counts)
-- Lifetime play_count per track per calendar month snapshot (not SOS settlement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spotify_track_play_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id         UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  release_id        UUID        REFERENCES public.releases (id) ON DELETE SET NULL,
  spotify_track_id  TEXT        NOT NULL,
  spotify_album_id  TEXT,
  track_name        TEXT,
  play_count        BIGINT      NOT NULL DEFAULT 0,
  period            TEXT        NOT NULL,
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spotify_track_id, period)
);

CREATE INDEX IF NOT EXISTS idx_spotify_track_play_snapshots_artist_period
  ON public.spotify_track_play_snapshots (artist_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_spotify_track_play_snapshots_release_period
  ON public.spotify_track_play_snapshots (release_id, period DESC)
  WHERE release_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: apify_usage_months  (monthly URL budget for Apify free tier)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.apify_usage_months (
  year_month   TEXT        PRIMARY KEY,
  urls_charged INTEGER     NOT NULL DEFAULT 0,
  budget       INTEGER     NOT NULL DEFAULT 1200,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TABLE: release_checklists  (per-artist release task tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.release_checklists (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  release_id    UUID        NOT NULL REFERENCES public.releases (id) ON DELETE CASCADE,
  task          TEXT        NOT NULL,
  is_completed  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, release_id, task)
);

CREATE INDEX IF NOT EXISTS idx_release_checklists_artist_release
  ON public.release_checklists (artist_id, release_id);

DROP TRIGGER IF EXISTS trg_release_checklists_updated_at ON public.release_checklists;
CREATE TRIGGER trg_release_checklists_updated_at
  BEFORE UPDATE ON public.release_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: press_photos  (DEPRECATED — migrated to assets + press_kit_items)
-- Kept for idempotent backfill on existing databases only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.press_photos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  alt_text       TEXT,
  r2_key         TEXT        NOT NULL UNIQUE,
  public_url     TEXT        NOT NULL,
  display_order  INTEGER     NOT NULL DEFAULT 0,
  category       TEXT        NOT NULL DEFAULT 'photo',
  artist_id      UUID        REFERENCES public.artists(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.press_photos ADD COLUMN IF NOT EXISTS category  TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE public.press_photos ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_press_photos_display_order
  ON public.press_photos (display_order ASC);

-- ---------------------------------------------------------------------------
-- TABLE: promo_tracks  (journalist-gated unreleased audio — R2 key only)
-- 3NF note: artist_name is the display name (required, may be for external/unlisted
-- artists). artist_id is an optional FK to a system artist — set it when the track
-- belongs to a known artist so the two tables stay in sync.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_tracks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  artist_name      TEXT        NOT NULL,
  -- Optional FK to a system artist (3NF: avoids name duplication for known artists)
  artist_id        UUID        REFERENCES public.artists (id) ON DELETE SET NULL,
  r2_key           TEXT        NOT NULL UNIQUE,
  file_size_bytes  BIGINT,
  duration_seconds INTEGER,
  display_order    INTEGER     NOT NULL DEFAULT 0,
  genre            TEXT,
  bpm              SMALLINT,
  key              TEXT,
  release_date     DATE,
  nda_required     BOOLEAN     NOT NULL DEFAULT FALSE,
  embargo_until    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS genre          TEXT;
ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS bpm            SMALLINT;
ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS key            TEXT;
ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS release_date   DATE;
ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS nda_required   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS embargo_until  TIMESTAMPTZ;
-- artist_id FK (optional — links to system artist when applicable)
ALTER TABLE public.promo_tracks ADD COLUMN IF NOT EXISTS artist_id      UUID REFERENCES public.artists (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promo_tracks_artist_id ON public.promo_tracks (artist_id);

CREATE INDEX IF NOT EXISTS idx_promo_tracks_display_order
  ON public.promo_tracks (display_order ASC);

-- ---------------------------------------------------------------------------
-- TABLE: journalist_applications  (promo-pool access requests)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journalist_applications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users (id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  outlet       TEXT        NOT NULL,
  message      TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending',
  reviewed_by  UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT journalist_applications_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Structured fields for website URL and application reason (added after initial schema)
ALTER TABLE public.journalist_applications ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.journalist_applications ADD COLUMN IF NOT EXISTS reason      TEXT;

CREATE INDEX IF NOT EXISTS idx_journalist_applications_user_id
  ON public.journalist_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_journalist_applications_status
  ON public.journalist_applications (status);
CREATE INDEX IF NOT EXISTS idx_journalist_applications_created_at
  ON public.journalist_applications (created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: portal_feature_flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_feature_flags (
  id          TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  target_role TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_feature_flags_target_role
  ON public.portal_feature_flags (target_role);

DROP TRIGGER IF EXISTS trg_portal_feature_flags_updated_at ON public.portal_feature_flags;
CREATE TRIGGER trg_portal_feature_flags_updated_at
  BEFORE UPDATE ON public.portal_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: label_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.label_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  subject       TEXT        NOT NULL,
  body          TEXT        NOT NULL,
  body_html     TEXT,
  read          BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  starred       BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  -- Email client metadata
  sender_email    TEXT,
  is_external     BOOLEAN     NOT NULL DEFAULT FALSE,
  forwarded_from  UUID        REFERENCES public.label_messages (id) ON DELETE SET NULL,
  has_attachments BOOLEAN     NOT NULL DEFAULT FALSE,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body,''))
  ) STORED,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.label_messages
  ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE public.label_messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE public.label_messages
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.label_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.label_messages
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_label_messages_artist_id_sent_at
  ON public.label_messages (artist_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_label_messages_search ON public.label_messages USING GIN(search_vector);

-- ---------------------------------------------------------------------------
-- TABLE: message_folders (must be before the FK on label_messages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  icon       TEXT,
  color      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- New columns for full email-client support
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS folder_id       UUID        REFERENCES public.message_folders (id) ON DELETE SET NULL;
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS sender_email    TEXT;
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS is_external     BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS forwarded_from  UUID        REFERENCES public.label_messages (id) ON DELETE SET NULL;
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.label_messages ADD COLUMN IF NOT EXISTS client_message_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_label_messages_client_message_id
  ON public.label_messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: message_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_rules (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  condition_field    TEXT        NOT NULL,
  condition_operator TEXT        NOT NULL,
  condition_value    TEXT        NOT NULL,
  action_type        TEXT        NOT NULL,
  action_target      TEXT,
  active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TABLE: message_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID        NOT NULL REFERENCES public.label_messages (id) ON DELETE CASCADE,
  filename   TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  mime_type  TEXT        NOT NULL,
  size       BIGINT      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
  ON public.message_attachments (message_id);

-- ---------------------------------------------------------------------------
-- TABLE: message_receipts (per-user read state for label + portal messages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_receipts (
  message_source TEXT NOT NULL CHECK (message_source IN ('label', 'portal')),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_source, message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_receipts_user
  ON public.message_receipts (user_id, message_source, read_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: message_internal_notes (staff-only notes on label/portal messages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_source TEXT NOT NULL CHECK (message_source IN ('label', 'portal')),
  message_id UUID NOT NULL,
  author_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_internal_notes_msg
  ON public.message_internal_notes (message_source, message_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: message_events (audit trail for message ops)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_source TEXT NOT NULL CHECK (message_source IN ('label', 'portal')),
  message_id UUID NOT NULL,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_events_msg
  ON public.message_events (message_source, message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_events_actor
  ON public.message_events (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: journalist_downloads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journalist_downloads (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journalist_id UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  release_id    UUID        REFERENCES public.releases (id) ON DELETE SET NULL,
  asset_id      UUID        REFERENCES public.assets (id) ON DELETE SET NULL,
  asset_key     TEXT        NOT NULL,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.journalist_downloads ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journalist_downloads_journalist_id
  ON public.journalist_downloads (journalist_id);
CREATE INDEX IF NOT EXISTS idx_journalist_downloads_downloaded_at
  ON public.journalist_downloads (downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_journalist_downloads_asset_id
  ON public.journalist_downloads (asset_id);

-- ---------------------------------------------------------------------------
-- TABLE: accreditation_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journalist_id UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_name    TEXT        NOT NULL,
  event_date    DATE        NOT NULL,
  publication   TEXT        NOT NULL,
  reason        TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accreditation_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_accreditation_requests_journalist_id
  ON public.accreditation_requests (journalist_id);
CREATE INDEX IF NOT EXISTS idx_accreditation_requests_status
  ON public.accreditation_requests (status);

DROP TRIGGER IF EXISTS trg_accreditation_requests_updated_at ON public.accreditation_requests;
CREATE TRIGGER trg_accreditation_requests_updated_at
  BEFORE UPDATE ON public.accreditation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: app_logs  (UI errors, R2 errors, Vercel errors, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source      TEXT        NOT NULL,           -- e.g. 'r2', 'supabase', 'upload', 'ui', 'vercel'
  level       TEXT        NOT NULL DEFAULT 'error', -- 'error' | 'warn' | 'info'
  message     TEXT        NOT NULL,
  details     JSONB       NOT NULL DEFAULT '{}',
  user_id     UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_source     ON public.app_logs (source);
CREATE INDEX IF NOT EXISTS idx_app_logs_level      ON public.app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: support_known_errors  (fingerprints excluded from Zammad auto-tickets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_known_errors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  notes       TEXT,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_known_errors_active ON public.support_known_errors (active) WHERE active = TRUE;

-- ---------------------------------------------------------------------------
-- TABLE: zammad_ticket_log  (local audit trail + deduplication for Zammad)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zammad_ticket_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint      TEXT,
  ticket_type      TEXT        NOT NULL CHECK (ticket_type IN ('manual', 'auto_error')),
  status           TEXT        NOT NULL CHECK (status IN (
    'sent', 'skipped', 'failed', 'blocked_known', 'blocked_duplicate', 'blocked_unconfigured'
  )),
  zammad_ticket_id INTEGER,
  user_id          UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  customer_email   TEXT,
  customer_name    TEXT,
  title            TEXT        NOT NULL,
  view_path        TEXT,
  error_source     TEXT,
  details          JSONB       NOT NULL DEFAULT '{}',
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zammad_ticket_log_fingerprint_user ON public.zammad_ticket_log (fingerprint, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zammad_ticket_log_created_at ON public.zammad_ticket_log (created_at DESC);

-- =============================================================================
-- IDEMPOTENCY KEYS — prevent duplicate financial transactions
-- Used by Portal write operations (submit-release, SOS confirm) to ensure
-- client-side double-clicks or network retries never create duplicate records.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key           UUID        PRIMARY KEY,
  resource_type TEXT        NOT NULL,  -- e.g. 'sos-confirm', 'submit-release'
  resource_id   UUID,                  -- optional: ID of the created resource
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleanup index: used by the TTL cleanup query (rows older than 24 h)
CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON public.idempotency_keys (created_at);

-- RLS: only service-role can insert/read (called server-side only)
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idempotency_keys: service_role only" ON public.idempotency_keys;
-- No policies → only service_role (bypasses RLS) can access this table.

-- =============================================================================
-- SYNC QUEUE — asynchronous background sync jobs
-- Decouples the sync trigger (POST /api/sync) from the actual processing so
-- that syncing many artists never exceeds Vercel's 10-second Edge timeout.
-- Each job processes one artist via POST /api/sync (every 5 min).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sync_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     UUID        REFERENCES public.artists (id) ON DELETE CASCADE,
  job_type      TEXT        NOT NULL DEFAULT 'full',  -- 'full' | 'spotify' | 'discogs' | 'youtube' | 'odesli'
  status        TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  locked_until  TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  error_message TEXT,
  attempt_count INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sync_queue ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE public.sync_queue ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;
ALTER TABLE public.sync_queue ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sync_queue_status       ON public.sync_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_artist        ON public.sync_queue (artist_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at   ON public.sync_queue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_finished ON public.sync_queue (status, finished_at DESC);

ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_queue: admin all" ON public.sync_queue;
CREATE POLICY "sync_queue: admin all" ON public.sync_queue
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- =============================================================================
-- COLUMN REMOVALS (idempotent)
-- Transitive-dependency fix (Track 1): artist_name was a 3NF violation.
-- Social-URL consolidation (Track 2): URLs live exclusively in artists table.
-- =============================================================================

-- Track 1: Remove redundant artist_name columns
ALTER TABLE public.releases DROP COLUMN IF EXISTS artist_name;
ALTER TABLE public.videos   DROP COLUMN IF EXISTS artist_name;
-- concerts.artist_name was NOT NULL so set a default first to be safe
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.concerts ALTER COLUMN artist_name SET DEFAULT '';
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
END $$;
ALTER TABLE public.concerts DROP COLUMN IF EXISTS artist_name;



ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS instagram_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS youtube_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS website_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS bandcamp_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS spotify_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS apple_music_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS tiktok_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS facebook_url;

ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS founding_year;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS hometown;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS photo_url;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS soundcloud_url;


ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS bio;
ALTER TABLE public.artist_epks DROP COLUMN IF EXISTS genres;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_credentials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_epks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epk_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epk_fonts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epk_share_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epk_download_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epk_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaming_stats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_statements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_import_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_territory_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_listener_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotify_track_play_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apify_usage_months           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_statement_line_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_impact                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_stops                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_contacts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_tasks                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_crew_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_merch_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_merch_settlements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_impact                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merch_orders                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_checklists    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.press_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_tracks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journalist_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_feature_flags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_folders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journalist_downloads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accreditation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editor_activity_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editor_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_known_errors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zammad_ticket_log     ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles: own read"        ON public.users;
DROP POLICY IF EXISTS "profiles: own update"      ON public.users;
DROP POLICY IF EXISTS "profiles: admin read all"  ON public.users;
DROP POLICY IF EXISTS "profiles: admin update all" ON public.users;

DROP POLICY IF EXISTS "users: own read"        ON public.users;
DROP POLICY IF EXISTS "users: own update"      ON public.users;
DROP POLICY IF EXISTS "users: admin read all"  ON public.users;
DROP POLICY IF EXISTS "users: admin update all" ON public.users;

CREATE POLICY "users: own read" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users: own update" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Uses get_my_role() (SECURITY DEFINER) to avoid infinite recursion that
-- would occur if this policy queried the users table directly.
CREATE POLICY "users: admin read all" ON public.users
  FOR SELECT USING (public.get_my_role() = 'admin');

-- Allows admins to update any user's profile row (e.g. change role, etc.)
-- get_my_role() is SECURITY DEFINER so it safely reads the caller's own role
-- without triggering recursive RLS evaluation.
CREATE POLICY "users: admin update all" ON public.users
  FOR UPDATE USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: role_permissions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "role_permissions: authenticated read" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions: admin update"       ON public.role_permissions;

-- Any authenticated user can read permissions (needed to check their own permissions)
CREATE POLICY "role_permissions: authenticated read" ON public.role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can modify role permissions
CREATE POLICY "role_permissions: admin update" ON public.role_permissions
  FOR UPDATE USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: artists
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "artists: public read"                  ON public.artists;
DROP POLICY IF EXISTS "artists: public read visible"          ON public.artists;
DROP POLICY IF EXISTS "artists: editor+ insert"               ON public.artists;
DROP POLICY IF EXISTS "artists: editor+ update"               ON public.artists;
DROP POLICY IF EXISTS "artists: admin delete"                 ON public.artists;
DROP POLICY IF EXISTS "artists: own artist update"            ON public.artists;
DROP POLICY IF EXISTS "artists: artist read own"              ON public.artists;
DROP POLICY IF EXISTS "artists: can_manage_artists insert"    ON public.artists;
DROP POLICY IF EXISTS "artists: can_manage_artists update"    ON public.artists;

-- Anonymous users only see visible artists; admins/editors see all
CREATE POLICY "artists: public read visible" ON public.artists
  FOR SELECT USING (
    is_visible = TRUE
    OR public.get_my_role() IN ('admin', 'editor')
  );

-- Portal members can read their own artist row even when is_visible = FALSE
CREATE POLICY "artists: artist read own" ON public.artists
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am
            WHERE am.artist_id = id AND am.user_id = auth.uid())
  );

-- Requires can_manage_artists permission (admin always bypasses)
CREATE POLICY "artists: can_manage_artists insert" ON public.artists
  FOR INSERT WITH CHECK (
    public.has_permission('can_manage_artists') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "artists: can_manage_artists update" ON public.artists
  FOR UPDATE USING (
    public.has_permission('can_manage_artists') OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    public.has_permission('can_manage_artists') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "artists: admin delete" ON public.artists
  FOR DELETE USING (public.get_my_role() = 'admin');

-- Portal members can update shared artist fields (bio, genres, URLs, image)
CREATE POLICY "artists: own artist update" ON public.artists
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.artist_members am
            WHERE am.artist_id = id AND am.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am
            WHERE am.artist_id = id AND am.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- RLS: releases
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "releases: public read"                  ON public.releases;
DROP POLICY IF EXISTS "releases: public read visible"          ON public.releases;
DROP POLICY IF EXISTS "releases: editor+ insert"               ON public.releases;
DROP POLICY IF EXISTS "releases: editor+ update"               ON public.releases;
DROP POLICY IF EXISTS "releases: admin delete"                 ON public.releases;
DROP POLICY IF EXISTS "releases: can_manage_releases insert"   ON public.releases;
DROP POLICY IF EXISTS "releases: can_manage_releases update"   ON public.releases;

-- Anonymous users only see visible releases whose artist is also visible;
-- admins/editors see all releases regardless of visibility.
CREATE POLICY "releases: public read visible" ON public.releases
  FOR SELECT USING (
    (
      is_visible = TRUE
      AND (
        artist_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.artists a
          WHERE a.id = artist_id AND a.is_visible = TRUE
        )
      )
    )
    OR public.get_my_role() IN ('admin', 'editor')
  );

-- Requires can_manage_releases permission (admin always bypasses)
CREATE POLICY "releases: can_manage_releases insert" ON public.releases
  FOR INSERT WITH CHECK (
    public.has_permission('can_manage_releases') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "releases: can_manage_releases update" ON public.releases
  FOR UPDATE USING (
    public.has_permission('can_manage_releases') OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    public.has_permission('can_manage_releases') OR public.get_my_role() = 'admin'
  );

-- Allows only admins to delete releases
CREATE POLICY "releases: admin delete" ON public.releases
  FOR DELETE USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: news_posts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "news_posts: public read"             ON public.news_posts;
DROP POLICY IF EXISTS "news_posts: editor+ insert"          ON public.news_posts;
DROP POLICY IF EXISTS "news_posts: editor+ update"          ON public.news_posts;
DROP POLICY IF EXISTS "news_posts: admin delete"            ON public.news_posts;
DROP POLICY IF EXISTS "news_posts: can_publish_news insert" ON public.news_posts;
DROP POLICY IF EXISTS "news_posts: can_edit_news update"    ON public.news_posts;

-- Public: published/scheduled posts once publish time is reached (lazy publishing).
-- Press-only posts are excluded from the anon path (journalists/staff still see all).
-- Editors, journalists, and admins can read all posts (drafts, future scheduled, etc.).
CREATE POLICY "news_posts: public read" ON public.news_posts
  FOR SELECT USING (
    (
      status IN ('published', 'scheduled')
      AND published_at <= NOW()
      AND is_press_only = false
    )
    OR public.has_permission('can_edit_news')
    OR public.has_permission('can_publish_news')
    OR public.get_my_role() IN ('admin', 'editor', 'journalist')
  );

-- Requires can_publish_news permission (admin always bypasses)
CREATE POLICY "news_posts: can_publish_news insert" ON public.news_posts
  FOR INSERT WITH CHECK (
    public.has_permission('can_publish_news') OR public.get_my_role() = 'admin'
  );

-- Requires can_edit_news permission (admin always bypasses)
CREATE POLICY "news_posts: can_edit_news update" ON public.news_posts
  FOR UPDATE USING (
    public.has_permission('can_edit_news') OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    public.has_permission('can_edit_news') OR public.get_my_role() = 'admin'
  );

-- Allows only admins to delete news posts
CREATE POLICY "news_posts: admin delete" ON public.news_posts
  FOR DELETE USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: videos
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "videos: public read"              ON public.videos;
DROP POLICY IF EXISTS "videos: editor+ insert"           ON public.videos;
DROP POLICY IF EXISTS "videos: editor+ update"           ON public.videos;
DROP POLICY IF EXISTS "videos: admin delete"             ON public.videos;
DROP POLICY IF EXISTS "videos: can_manage_videos insert" ON public.videos;
DROP POLICY IF EXISTS "videos: can_manage_videos update" ON public.videos;

-- Public: only visible videos. Staff (admin/editor) see all (incl. hidden).
CREATE POLICY "videos: public read" ON public.videos
  FOR SELECT USING (
    is_visible = TRUE
    OR public.get_my_role() IN ('admin', 'editor')
  );

-- Requires can_manage_videos permission (admin always bypasses)
CREATE POLICY "videos: can_manage_videos insert" ON public.videos
  FOR INSERT WITH CHECK (
    public.has_permission('can_manage_videos') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "videos: can_manage_videos update" ON public.videos
  FOR UPDATE USING (
    public.has_permission('can_manage_videos') OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    public.has_permission('can_manage_videos') OR public.get_my_role() = 'admin'
  );

-- Allows only admins to delete videos
CREATE POLICY "videos: admin delete" ON public.videos
  FOR DELETE USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: assets
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "assets: authenticated read"          ON public.assets;
DROP POLICY IF EXISTS "assets: staff read"                  ON public.assets;
DROP POLICY IF EXISTS "assets: editor+ insert"              ON public.assets;
DROP POLICY IF EXISTS "assets: admin delete"                ON public.assets;
DROP POLICY IF EXISTS "assets: editor+ update"              ON public.assets;
DROP POLICY IF EXISTS "assets: can_view_admin_panel insert" ON public.assets;
DROP POLICY IF EXISTS "assets: can_view_admin_panel update" ON public.assets;
DROP POLICY IF EXISTS "assets: public press read"            ON public.assets;

-- Staff only: full asset catalogue (admin file explorer). Not every logged-in user.
CREATE POLICY "assets: staff read" ON public.assets
  FOR SELECT USING (
    public.has_permission('can_view_admin_panel')
    OR public.get_my_role() IN ('admin', 'editor')
  );

-- Allows anonymous/public read of press-approved assets (replaces press_photos public read)
CREATE POLICY "assets: public press read" ON public.assets
  FOR SELECT USING (
    is_press_approved = TRUE AND downloadable_for_press = TRUE
  );

-- Requires can_view_admin_panel permission (admin always bypasses)
CREATE POLICY "assets: can_view_admin_panel insert" ON public.assets
  FOR INSERT WITH CHECK (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "assets: can_view_admin_panel update" ON public.assets
  FOR UPDATE USING (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  );

-- Allows only admins to delete assets
CREATE POLICY "assets: admin delete" ON public.assets
  FOR DELETE USING (public.get_my_role() = 'admin');

ALTER TABLE public.asset_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "asset_folders: authenticated read"          ON public.asset_folders;
DROP POLICY IF EXISTS "asset_folders: staff read"                  ON public.asset_folders;
DROP POLICY IF EXISTS "asset_folders: editor+ write"               ON public.asset_folders;
DROP POLICY IF EXISTS "asset_folders: admin delete"                ON public.asset_folders;
DROP POLICY IF EXISTS "asset_folders: editor+ update"              ON public.asset_folders;
DROP POLICY IF EXISTS "asset_folders: can_view_admin_panel write"  ON public.asset_folders;
DROP POLICY IF EXISTS "asset_folders: can_view_admin_panel update" ON public.asset_folders;
-- Staff only: browse all folders (matches assets: staff read)
CREATE POLICY "asset_folders: staff read" ON public.asset_folders
  FOR SELECT TO authenticated
  USING (
    public.has_permission('can_view_admin_panel')
    OR public.get_my_role() IN ('admin', 'editor')
  );
-- Requires can_view_admin_panel permission
CREATE POLICY "asset_folders: can_view_admin_panel write"  ON public.asset_folders FOR INSERT TO authenticated WITH CHECK (
  public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
);
-- Allows only admins to delete asset folders
CREATE POLICY "asset_folders: admin delete"                ON public.asset_folders FOR DELETE TO authenticated USING (
  public.get_my_role() = 'admin'
);
-- Requires can_view_admin_panel permission to rename/move asset folders
CREATE POLICY "asset_folders: can_view_admin_panel update" ON public.asset_folders FOR UPDATE TO authenticated USING (
  public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
);

-- ---------------------------------------------------------------------------
-- RLS: asset_artists
-- ---------------------------------------------------------------------------
ALTER TABLE public.asset_artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "asset_artists: authenticated read"  ON public.asset_artists;
DROP POLICY IF EXISTS "asset_artists: editor+ write"       ON public.asset_artists;
DROP POLICY IF EXISTS "asset_artists: editor+ delete"      ON public.asset_artists;

-- Allows any authenticated user to read asset–artist links
CREATE POLICY "asset_artists: authenticated read" ON public.asset_artists
  FOR SELECT TO authenticated USING (true);

-- Allows editors and admins to link assets to artists
CREATE POLICY "asset_artists: editor+ write" ON public.asset_artists
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','editor'))
  );

-- Allows editors and admins to unlink assets from artists
CREATE POLICY "asset_artists: editor+ delete" ON public.asset_artists
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','editor'))
  );

-- ---------------------------------------------------------------------------
-- RLS: site_settings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "site_settings_public_read"  ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_write"  ON public.site_settings;

-- Public: only non-sensitive CMS keys. Staff (admin/editor) read all keys.
-- Admin-only examples: label_billing_*, invite_link_expiry_hours.
-- SSOT list mirrored in src/lib/api/siteSettingsPublicKeys.ts
CREATE POLICY "site_settings_public_read" ON public.site_settings
  FOR SELECT USING (
    public.get_my_role() IN ('admin', 'editor')
    OR key = ANY (ARRAY[
      'label_name',
      'label_short_name',
      'label_tagline',
      'contact_email',
      'privacy_policy_url',
      'terms_url',
      'instagram_url',
      'youtube_url',
      'spotify_url',
      'spotify_playlist_uri',
      'spotify_playlists',
      'hero_badge',
      'hero_news_badge',
      'hero_description',
      'hero_content_type',
      'hero_featured_id',
      'hero_custom_bg_url',
      'hero_default_primary_btn_label',
      'hero_default_secondary_btn_label',
      'seo_title',
      'seo_description',
      'og_title',
      'og_description',
      'impressum_company_name',
      'impressum_legal_form',
      'impressum_representative',
      'impressum_address',
      'impressum_vat_id',
      'impressum_register_court',
      'impressum_register_number',
      'impressum_phone',
      'impressum_email',
      'datenschutz_content',
      'datenschutz_content_en',
      'agb_content',
      'agb_content_en',
      'portal_terms_version',
      'consent_placeholder_url',
      'noise_opacity',
      'crt_scanlines_enabled',
      'vignette_intensity',
      'shopify_store_url',
      'submit_hub_url',
      'submit_hub_label',
      'submit_hub_description',
      'submit_hub_section_heading',
      'show_about_in_header',
      'show_about_in_footer',
      'about_nav_label',
      'youtube_channel_id',
      'carousel_autoplay_ms',
      'videos_per_page',
      'videos_link_to_page',
      'exclude_shorts_from_public',
      'concerts_per_page',
      'concerts_link_to_page',
      'feature_toggles',
      'logo_url',
      'favicon_url',
      'about_headline',
      'about_subheading',
      'about_body',
      'newsletter_heading',
      'newsletter_description',
      'spotify_section_heading',
      'spotify_section_subheading',
      'videos_section_heading',
      'videos_section_subheading',
      'news_section_heading',
      'news_section_subheading',
      'concerts_section_heading',
      'concerts_section_subheading',
      'releases_section_heading',
      'releases_section_subheading',
      'homepage_section_order',
      'homepage_news_count',
      'contact_topics',
      'custom_social_links',
      'theme_primary',
      'theme_secondary',
      'theme_background',
      'theme_foreground',
      'theme_card',
      'theme_muted',
      'theme_accent',
      'theme_border',
      'theme_gradient_hero_from',
      'theme_gradient_hero_to',
      'theme_gradient_hero_dir',
      'theme_gradient_accent_from',
      'theme_gradient_accent_to',
      'theme_gradient_accent_dir',
      'theme_config'
    ]::text[])
  );

-- Allows editors and admins to update site settings
CREATE POLICY "site_settings_admin_write" ON public.site_settings
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: api_credentials
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "api_credentials_admin_only" ON public.api_credentials;

-- Admin-only: external API keys must not be readable by editors or the public.
CREATE POLICY "api_credentials_admin_only" ON public.api_credentials
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: sync_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sync_logs: editor+ read" ON public.sync_logs;

-- Allows editors and admins to view sync log entries
CREATE POLICY "sync_logs: editor+ read" ON public.sync_logs
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: app_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "app_logs: admin read"   ON public.app_logs;
DROP POLICY IF EXISTS "app_logs: admin insert" ON public.app_logs;

-- Any authenticated user can write (so the UI can report its own errors)
CREATE POLICY "app_logs: admin read" ON public.app_logs
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

-- Allows any authenticated user to write error logs from the UI
CREATE POLICY "app_logs: authenticated insert" ON public.app_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- RLS: support_known_errors
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "support_known_errors: admin read"   ON public.support_known_errors;
DROP POLICY IF EXISTS "support_known_errors: admin write" ON public.support_known_errors;

CREATE POLICY "support_known_errors: admin read" ON public.support_known_errors
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "support_known_errors: admin write" ON public.support_known_errors
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: zammad_ticket_log
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "zammad_ticket_log: admin read" ON public.zammad_ticket_log;

CREATE POLICY "zammad_ticket_log: admin read" ON public.zammad_ticket_log
  FOR SELECT USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: concerts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated reads on concerts" ON public.concerts;
DROP POLICY IF EXISTS "Allow admin inserts on concerts"       ON public.concerts;
DROP POLICY IF EXISTS "Allow admin updates on concerts"       ON public.concerts;
DROP POLICY IF EXISTS "Allow admin deletes on concerts"       ON public.concerts;
DROP POLICY IF EXISTS "concerts: public read visible"         ON public.concerts;
DROP POLICY IF EXISTS "concerts: artist own insert"           ON public.concerts;
DROP POLICY IF EXISTS "concerts: artist own update"           ON public.concerts;
DROP POLICY IF EXISTS "concerts: artist own delete"           ON public.concerts;
DROP POLICY IF EXISTS "concerts: artist manage own"           ON public.concerts;

-- Anonymous users only see concerts for visible artists; admins/editors see all
CREATE POLICY "concerts: public read visible" ON public.concerts
  FOR SELECT USING (
    artist_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = artist_id AND a.is_visible = TRUE
    )
    OR public.get_my_role() IN ('admin', 'editor')
  );

-- Allows editors and admins to create concerts
CREATE POLICY "Allow admin inserts on concerts" ON public.concerts
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- Allows editors and admins to update concerts
CREATE POLICY "Allow admin updates on concerts" ON public.concerts
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'editor'));

-- Allows editors and admins to delete concerts
CREATE POLICY "Allow admin deletes on concerts" ON public.concerts
  FOR DELETE USING (public.get_my_role() IN ('admin', 'editor'));

-- Allows artists to create concerts for their own profile
CREATE POLICY "concerts: artist own insert" ON public.concerts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

-- Allows artists to update their own concerts
CREATE POLICY "concerts: artist own update" ON public.concerts
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

-- Allows artists to delete their own concerts
CREATE POLICY "concerts: artist own delete" ON public.concerts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "concerts: artist manage own" ON public.concerts
  FOR ALL USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- RLS: editor_activity_log
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "editor_activity_log: admin read" ON public.editor_activity_log;
DROP POLICY IF EXISTS "editor_activity_log: editor read own" ON public.editor_activity_log;
DROP POLICY IF EXISTS "editor_activity_log: editor insert own" ON public.editor_activity_log;

CREATE POLICY "editor_activity_log: admin read" ON public.editor_activity_log
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "editor_activity_log: editor read own" ON public.editor_activity_log
  FOR SELECT USING (public.get_my_role() = 'editor' AND editor_id = auth.uid());

CREATE POLICY "editor_activity_log: editor insert own" ON public.editor_activity_log
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'editor' AND editor_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- RLS: editor_notifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "editor_notifications: editor read own" ON public.editor_notifications;
DROP POLICY IF EXISTS "editor_notifications: editor update own" ON public.editor_notifications;
DROP POLICY IF EXISTS "editor_notifications: admin manage" ON public.editor_notifications;

CREATE POLICY "editor_notifications: editor read own" ON public.editor_notifications
  FOR SELECT USING (
    public.get_my_role() = 'editor' AND recipient_id = auth.uid()
  );

CREATE POLICY "editor_notifications: editor update own" ON public.editor_notifications
  FOR UPDATE USING (
    public.get_my_role() = 'editor' AND recipient_id = auth.uid()
  )
  WITH CHECK (
    public.get_my_role() = 'editor' AND recipient_id = auth.uid()
  );

CREATE POLICY "editor_notifications: admin manage" ON public.editor_notifications
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: notifications (unified; INSERT via service role only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications: own read" ON public.notifications;
DROP POLICY IF EXISTS "notifications: own update" ON public.notifications;
DROP POLICY IF EXISTS "notifications: admin read all" ON public.notifications;

CREATE POLICY "notifications: own read" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications: own update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications: admin read all" ON public.notifications
  FOR SELECT USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: notification_preferences
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notification_preferences: own all" ON public.notification_preferences;

CREATE POLICY "notification_preferences: own all" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: interview_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "interview_requests: journalist manage own" ON public.interview_requests;
DROP POLICY IF EXISTS "interview_requests: artist read own" ON public.interview_requests;
DROP POLICY IF EXISTS "interview_requests: artist update own" ON public.interview_requests;

CREATE POLICY "interview_requests: journalist manage own" ON public.interview_requests
  FOR ALL USING (journalist_id = auth.uid())
  WITH CHECK (journalist_id = auth.uid());

CREATE POLICY "interview_requests: artist read own" ON public.interview_requests
  FOR SELECT USING (artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid()));

CREATE POLICY "interview_requests: artist update own" ON public.interview_requests
  FOR UPDATE USING (artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid()));



-- ---------------------------------------------------------------------------
-- RLS: artist_epks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "artist_profiles: artist read own"   ON public.artist_epks;
DROP POLICY IF EXISTS "artist_profiles: artist insert own" ON public.artist_epks;
DROP POLICY IF EXISTS "artist_profiles: artist update own" ON public.artist_epks;
DROP POLICY IF EXISTS "artist_profiles: admin all"         ON public.artist_epks;

DROP POLICY IF EXISTS "artist_epks: artist read own"   ON public.artist_epks;
DROP POLICY IF EXISTS "artist_epks: artist insert own" ON public.artist_epks;
DROP POLICY IF EXISTS "artist_epks: artist update own" ON public.artist_epks;
DROP POLICY IF EXISTS "artist_epks: admin all"         ON public.artist_epks;

-- Allows artists to read their own EPK/profile data
CREATE POLICY "artist_epks: artist read own" ON public.artist_epks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

-- Allows artists to insert their own EPK/profile (required for first-time upsert)
CREATE POLICY "artist_epks: artist insert own" ON public.artist_epks
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

-- Allows artists to update their own EPK/profile data
CREATE POLICY "artist_epks: artist update own" ON public.artist_epks
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

-- Allows admins full access to all artist epks
CREATE POLICY "artist_epks: admin all" ON public.artist_epks
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- No anon public SELECT on artist_epks (would leak epk_password_hash + full row).
-- Public/press EPK content is served only via service-role server code
-- (getPublicArtistEpkByArtistId) with an explicit column whitelist.
DROP POLICY IF EXISTS "artist_epks: public read visible" ON public.artist_epks;

-- ---------------------------------------------------------------------------
-- RLS: epk_versions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "epk_versions: artist read own"   ON public.epk_versions;
DROP POLICY IF EXISTS "epk_versions: artist insert own" ON public.epk_versions;
DROP POLICY IF EXISTS "epk_versions: admin all"         ON public.epk_versions;

CREATE POLICY "epk_versions: artist read own" ON public.epk_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_versions: artist insert own" ON public.epk_versions
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

CREATE POLICY "epk_versions: admin all" ON public.epk_versions
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: artist_landing_pages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "artist_landing_pages: artist read own"   ON public.artist_landing_pages;
DROP POLICY IF EXISTS "artist_landing_pages: artist insert own" ON public.artist_landing_pages;
DROP POLICY IF EXISTS "artist_landing_pages: artist update own" ON public.artist_landing_pages;
DROP POLICY IF EXISTS "artist_landing_pages: admin all"         ON public.artist_landing_pages;
DROP POLICY IF EXISTS "artist_landing_pages: public read published" ON public.artist_landing_pages;

CREATE POLICY "artist_landing_pages: artist read own" ON public.artist_landing_pages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "artist_landing_pages: artist insert own" ON public.artist_landing_pages
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

CREATE POLICY "artist_landing_pages: artist update own" ON public.artist_landing_pages
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

CREATE POLICY "artist_landing_pages: admin all" ON public.artist_landing_pages
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "artist_landing_pages: editor+ read all" ON public.artist_landing_pages;
CREATE POLICY "artist_landing_pages: editor+ read all" ON public.artist_landing_pages
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS "artist_landing_pages: editor+ update" ON public.artist_landing_pages;
CREATE POLICY "artist_landing_pages: editor+ update" ON public.artist_landing_pages
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'editor'));

CREATE POLICY "artist_landing_pages: public read published" ON public.artist_landing_pages
  FOR SELECT USING (
    publish_status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = artist_id AND a.is_visible = TRUE
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: epk_fonts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "epk_fonts: artist read own"   ON public.epk_fonts;
DROP POLICY IF EXISTS "epk_fonts: artist insert own" ON public.epk_fonts;
DROP POLICY IF EXISTS "epk_fonts: artist delete own" ON public.epk_fonts;
DROP POLICY IF EXISTS "epk_fonts: admin all"         ON public.epk_fonts;

CREATE POLICY "epk_fonts: artist read own" ON public.epk_fonts
  FOR SELECT USING (
    artist_id IS NULL
    OR EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_fonts: artist insert own" ON public.epk_fonts
  FOR INSERT
  WITH CHECK (
    artist_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_fonts: artist delete own" ON public.epk_fonts
  FOR DELETE USING (
    artist_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_fonts: admin all" ON public.epk_fonts
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "epk_fonts: public read visible artist" ON public.epk_fonts;
CREATE POLICY "epk_fonts: public read visible artist" ON public.epk_fonts
  FOR SELECT USING (
    artist_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = artist_id AND a.is_visible = TRUE
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: epk_share_links
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "epk_share_links: artist read own"   ON public.epk_share_links;
DROP POLICY IF EXISTS "epk_share_links: artist insert own" ON public.epk_share_links;
DROP POLICY IF EXISTS "epk_share_links: artist update own" ON public.epk_share_links;
DROP POLICY IF EXISTS "epk_share_links: admin all"         ON public.epk_share_links;

CREATE POLICY "epk_share_links: artist read own" ON public.epk_share_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_share_links: artist insert own" ON public.epk_share_links
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_share_links: artist update own" ON public.epk_share_links
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_share_links: admin all" ON public.epk_share_links
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: epk_download_events
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "epk_download_events: artist read own" ON public.epk_download_events;
DROP POLICY IF EXISTS "epk_download_events: admin all"     ON public.epk_download_events;

CREATE POLICY "epk_download_events: artist read own" ON public.epk_download_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "epk_download_events: admin all" ON public.epk_download_events
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: epk_templates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "epk_templates: read published" ON public.epk_templates;
DROP POLICY IF EXISTS "epk_templates: admin all"      ON public.epk_templates;

CREATE POLICY "epk_templates: read published" ON public.epk_templates
  FOR SELECT USING (
    (is_published = TRUE AND auth.uid() IS NOT NULL)
    OR public.get_my_role() IN ('admin', 'editor')
  );

CREATE POLICY "epk_templates: admin all" ON public.epk_templates
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: streaming_stats
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "streaming_stats: artist read own" ON public.streaming_stats;
DROP POLICY IF EXISTS "streaming_stats: admin all"       ON public.streaming_stats;

-- Allows artists to view their own streaming statistics
CREATE POLICY "streaming_stats: artist read own" ON public.streaming_stats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

-- Allows admins and editors to manage streaming stats (SOS rollup writes)
CREATE POLICY "streaming_stats: admin all" ON public.streaming_stats
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: sales_statements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_statements: artist read own" ON public.sales_statements;
DROP POLICY IF EXISTS "sales_statements: admin all"       ON public.sales_statements;

-- Allows artists to view their own approved+ statements (drafts are admin-only)
CREATE POLICY "sales_statements: artist read own" ON public.sales_statements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
    AND status IN ('label_approved', 'artist_notified', 'viewed', 'invoiced', 'paid', 'acknowledged')
  );

-- Allows admins full access to all sales statements
CREATE POLICY "sales_statements: admin all" ON public.sales_statements
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: distributor_import_batches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "distributor_import_batches: admin all" ON public.distributor_import_batches;
CREATE POLICY "distributor_import_batches: admin all" ON public.distributor_import_batches
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- Artists may read metadata for bronze batches linked to their visible statements
-- (hash, distributor, period — chain-of-custody / provenance UI). No write access.
DROP POLICY IF EXISTS "distributor_import_batches: artist read linked" ON public.distributor_import_batches;
CREATE POLICY "distributor_import_batches: artist read linked" ON public.distributor_import_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.sales_statements ss
      WHERE ss.batch_id = distributor_import_batches.id
        AND ss.status IN ('label_approved', 'artist_notified', 'viewed', 'invoiced', 'paid', 'acknowledged')
        AND EXISTS (
          SELECT 1 FROM public.artist_members am
          WHERE am.artist_id = ss.artist_id AND am.user_id = auth.uid()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: artist_territory_metrics
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "artist_territory_metrics: artist read own" ON public.artist_territory_metrics;
DROP POLICY IF EXISTS "artist_territory_metrics: admin all"       ON public.artist_territory_metrics;

CREATE POLICY "artist_territory_metrics: artist read own" ON public.artist_territory_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "artist_territory_metrics: admin all" ON public.artist_territory_metrics
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: artist_listener_metrics
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "artist_listener_metrics: artist read own" ON public.artist_listener_metrics;
DROP POLICY IF EXISTS "artist_listener_metrics: admin all"       ON public.artist_listener_metrics;

CREATE POLICY "artist_listener_metrics: artist read own" ON public.artist_listener_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "artist_listener_metrics: admin all" ON public.artist_listener_metrics
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: spotify_track_play_snapshots
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "spotify_track_play_snapshots: artist read own" ON public.spotify_track_play_snapshots;
DROP POLICY IF EXISTS "spotify_track_play_snapshots: admin all"       ON public.spotify_track_play_snapshots;

CREATE POLICY "spotify_track_play_snapshots: artist read own" ON public.spotify_track_play_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "spotify_track_play_snapshots: admin all" ON public.spotify_track_play_snapshots
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: apify_usage_months (admin/editor only — budget is label infrastructure)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "apify_usage_months: admin all" ON public.apify_usage_months;

CREATE POLICY "apify_usage_months: admin all" ON public.apify_usage_months
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: sales_statement_line_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_statement_line_items: artist read own" ON public.sales_statement_line_items;
DROP POLICY IF EXISTS "sales_statement_line_items: admin all"       ON public.sales_statement_line_items;

CREATE POLICY "sales_statement_line_items: artist read own" ON public.sales_statement_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_statements ss
      JOIN public.artist_members am ON am.artist_id = ss.artist_id
      WHERE ss.id = statement_id
        AND am.user_id = auth.uid()
        AND ss.status IN ('label_approved', 'artist_notified', 'viewed', 'invoiced', 'paid', 'acknowledged')
    )
  );

CREATE POLICY "sales_statement_line_items: admin all" ON public.sales_statement_line_items
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: event_impact
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "event_impact: artist read own" ON public.event_impact;
DROP POLICY IF EXISTS "event_impact: admin all"       ON public.event_impact;

CREATE POLICY "event_impact: artist read own" ON public.event_impact
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "event_impact: admin all" ON public.event_impact
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: promo_impact
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "promo_impact: artist read own" ON public.promo_impact;
DROP POLICY IF EXISTS "promo_impact: admin all"       ON public.promo_impact;

CREATE POLICY "promo_impact: artist read own" ON public.promo_impact
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "promo_impact: admin all" ON public.promo_impact
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: page_events
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "page_events: artist read own" ON public.page_events;
DROP POLICY IF EXISTS "page_events: admin all"       ON public.page_events;

CREATE POLICY "page_events: artist read own" ON public.page_events
  FOR SELECT USING (
    artist_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "page_events: admin all" ON public.page_events
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: merch_orders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "merch_orders: artist read own" ON public.merch_orders;
DROP POLICY IF EXISTS "merch_orders: admin all"       ON public.merch_orders;

CREATE POLICY "merch_orders: artist read own" ON public.merch_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

CREATE POLICY "merch_orders: admin all" ON public.merch_orders
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- RLS: release_checklists
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "release_checklists: artist read own"   ON public.release_checklists;
DROP POLICY IF EXISTS "release_checklists: artist insert own" ON public.release_checklists;
DROP POLICY IF EXISTS "release_checklists: artist update own" ON public.release_checklists;
DROP POLICY IF EXISTS "release_checklists: admin all"         ON public.release_checklists;

-- Allows artists to read their own release checklists
CREATE POLICY "release_checklists: artist read own" ON public.release_checklists
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

-- Allows artists to create checklists for their releases
CREATE POLICY "release_checklists: artist insert own" ON public.release_checklists
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

-- Allows artists to update their own release checklists
CREATE POLICY "release_checklists: artist update own" ON public.release_checklists
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid()));

-- Allows admins full access to all release checklists
CREATE POLICY "release_checklists: admin all" ON public.release_checklists
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: press_photos  (DEPRECATED — kept for legacy DB backfill source only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.press_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "press_photos: public read" ON public.press_photos;
DROP POLICY IF EXISTS "press_photos: admin all"   ON public.press_photos;

CREATE POLICY "press_photos: public read" ON public.press_photos
  FOR SELECT USING (TRUE);

CREATE POLICY "press_photos: admin all" ON public.press_photos
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: press_kit_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.press_kit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "press_kit_items: public read"                    ON public.press_kit_items;
DROP POLICY IF EXISTS "press_kit_items: can_view_admin_panel insert"    ON public.press_kit_items;
DROP POLICY IF EXISTS "press_kit_items: can_view_admin_panel update"    ON public.press_kit_items;
DROP POLICY IF EXISTS "press_kit_items: can_view_admin_panel delete"    ON public.press_kit_items;

CREATE POLICY "press_kit_items: public read" ON public.press_kit_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_id
        AND a.is_press_approved = TRUE
        AND a.downloadable_for_press = TRUE
    )
  );

CREATE POLICY "press_kit_items: can_view_admin_panel insert" ON public.press_kit_items
  FOR INSERT WITH CHECK (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "press_kit_items: can_view_admin_panel update" ON public.press_kit_items
  FOR UPDATE USING (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  );

CREATE POLICY "press_kit_items: can_view_admin_panel delete" ON public.press_kit_items
  FOR DELETE USING (
    public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- RLS: promo_tracks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "promo_tracks: journalist read" ON public.promo_tracks;
DROP POLICY IF EXISTS "promo_tracks: admin all"       ON public.promo_tracks;

-- Allows accredited journalists and admins to access promo tracks
CREATE POLICY "promo_tracks: journalist read" ON public.promo_tracks
  FOR SELECT USING (public.get_my_role() IN ('journalist', 'admin'));

-- Allows admins full access to promo tracks
CREATE POLICY "promo_tracks: admin all" ON public.promo_tracks
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: journalist_applications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "journalist_applications: own read"    ON public.journalist_applications;
DROP POLICY IF EXISTS "journalist_applications: own insert"  ON public.journalist_applications;
DROP POLICY IF EXISTS "journalist_applications: admin all"   ON public.journalist_applications;

-- Allows applicants to read their own application
CREATE POLICY "journalist_applications: own read" ON public.journalist_applications
  FOR SELECT USING (auth.uid() = user_id);

-- Allows authenticated users to submit a journalist application
CREATE POLICY "journalist_applications: own insert" ON public.journalist_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allows admins full access to journalist applications
CREATE POLICY "journalist_applications: admin all" ON public.journalist_applications
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: portal_feature_flags
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "portal_feature_flags: authenticated read" ON public.portal_feature_flags;
DROP POLICY IF EXISTS "portal_feature_flags: admin write" ON public.portal_feature_flags;

-- Allows any authenticated user to read portal feature flags
CREATE POLICY "portal_feature_flags: authenticated read" ON public.portal_feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allows admins to manage portal feature flags
CREATE POLICY "portal_feature_flags: admin write" ON public.portal_feature_flags
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: label_messages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "label_messages: artist own read" ON public.label_messages;
DROP POLICY IF EXISTS "label_messages: admin all" ON public.label_messages;

-- Allows artists to read messages sent to their profile
CREATE POLICY "label_messages: artist own read" ON public.label_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

-- Allows admins full access to all label messages
CREATE POLICY "label_messages: admin all" ON public.label_messages
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: message_folders (admin-managed inbox folders)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "message_folders: admin all" ON public.message_folders;

CREATE POLICY "message_folders: admin all" ON public.message_folders
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: message_rules (admin-managed inbox routing rules)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "message_rules: admin all" ON public.message_rules;

CREATE POLICY "message_rules: admin all" ON public.message_rules
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: message_attachments (attachments on label_messages)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "message_attachments: artist own read" ON public.message_attachments;
DROP POLICY IF EXISTS "message_attachments: admin all"       ON public.message_attachments;

-- Artists can read attachments on messages addressed to their artist profile
CREATE POLICY "message_attachments: artist own read" ON public.message_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.label_messages lm
      JOIN public.artist_members am ON am.artist_id = lm.artist_id
      WHERE lm.id = message_id AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "message_attachments: admin all" ON public.message_attachments
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: message_receipts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "message_receipts: own all" ON public.message_receipts;
DROP POLICY IF EXISTS "message_receipts: admin read" ON public.message_receipts;

CREATE POLICY "message_receipts: own all" ON public.message_receipts
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "message_receipts: admin read" ON public.message_receipts
  FOR SELECT USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: message_internal_notes (staff only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "message_internal_notes: admin all" ON public.message_internal_notes;
DROP POLICY IF EXISTS "message_internal_notes: editor read write" ON public.message_internal_notes;

CREATE POLICY "message_internal_notes: admin all" ON public.message_internal_notes
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "message_internal_notes: editor read write" ON public.message_internal_notes
  FOR ALL USING (public.get_my_role() = 'editor')
  WITH CHECK (public.get_my_role() = 'editor');

-- ---------------------------------------------------------------------------
-- RLS: message_events (staff read; insert via service role or staff)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "message_events: admin all" ON public.message_events;
DROP POLICY IF EXISTS "message_events: editor insert read" ON public.message_events;

CREATE POLICY "message_events: admin all" ON public.message_events
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "message_events: editor insert read" ON public.message_events
  FOR ALL USING (public.get_my_role() = 'editor')
  WITH CHECK (public.get_my_role() = 'editor');

-- ---------------------------------------------------------------------------
-- RLS: journalist_downloads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "journalist_downloads: own read" ON public.journalist_downloads;
DROP POLICY IF EXISTS "journalist_downloads: own insert" ON public.journalist_downloads;
DROP POLICY IF EXISTS "journalist_downloads: admin read" ON public.journalist_downloads;

-- Allows journalists to view their own download history
CREATE POLICY "journalist_downloads: own read" ON public.journalist_downloads
  FOR SELECT USING (journalist_id = auth.uid());

-- Allows journalists to log new downloads (GDPR Art. 6(1)(f))
CREATE POLICY "journalist_downloads: own insert" ON public.journalist_downloads
  FOR INSERT WITH CHECK (journalist_id = auth.uid());

-- Allows admins to read all journalist download logs
CREATE POLICY "journalist_downloads: admin read" ON public.journalist_downloads
  FOR SELECT USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- RLS: accreditation_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "accreditation_requests: own read" ON public.accreditation_requests;
DROP POLICY IF EXISTS "accreditation_requests: own insert" ON public.accreditation_requests;
DROP POLICY IF EXISTS "accreditation_requests: admin all" ON public.accreditation_requests;

-- Allows journalists to read their own accreditation requests
CREATE POLICY "accreditation_requests: own read" ON public.accreditation_requests
  FOR SELECT USING (journalist_id = auth.uid());

-- Allows authenticated users to submit accreditation requests
CREATE POLICY "accreditation_requests: own insert" ON public.accreditation_requests
  FOR INSERT WITH CHECK (journalist_id = auth.uid());

-- Allows admins full access to accreditation requests
CREATE POLICY "accreditation_requests: admin all" ON public.accreditation_requests
  FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Default CMS site settings
INSERT INTO public.site_settings (key, value) VALUES
  ('label_name',           'Music Label'),
  ('label_short_name',     ''),
  ('label_tagline',        'We don''t follow trends—we create them.'),
  ('contact_email',        'label@localhost'),
  ('privacy_policy_url',   '/datenschutz'),
  ('terms_url',            '/impressum'),
  ('instagram_url',        ''),
  ('youtube_url',          ''),
  ('spotify_url',          ''),
  ('spotify_playlist_uri', '37i9dQZF1DWWqNV5cS50j6'),
  ('hero_badge',           '⚡ New Release'),
  ('hero_description',     'Experience the latest evolution in alternative music. A sonic journey that pushes boundaries and defies expectations.'),
  ('seo_title',            'Music Label'),
  ('seo_description',      'Official website for Music Label — discover artists, releases, news, and videos.'),
  ('og_title',             'Music Label'),
  ('og_description',       'Music label — artists, releases, news, and videos.'),
  -- Visual overlay defaults
  ('noise_opacity',         '0.04'),
  ('crt_scanlines_enabled', 'true'),
  ('vignette_intensity',    '0.5')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.portal_feature_flags (id, label, enabled, target_role) VALUES
  ('artist.analytics', 'Artist Analytics Dashboard', TRUE, 'artist'),
  ('artist.statements', 'Artist Statements', TRUE, 'artist'),
  ('artist.marketing', 'Artist Marketing', TRUE, 'artist'),
  ('artist.invoices', 'Artist Invoices', TRUE, 'artist'),
  ('artist.documents', 'Artist Document Vault', TRUE, 'artist'),
  ('artist.calendar', 'Artist Release Calendar', TRUE, 'artist'),
  ('artist.epk_builder', 'EPK Canvas Builder', TRUE, 'artist'),
  ('artist.fan_page', 'Fan Page Builder', TRUE, 'artist'),
  ('artist.tour_planner', 'Tour Planner (TRACK)', TRUE, 'artist'),
  ('journalist.accreditation', 'Journalist Accreditation', TRUE, 'journalist')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.portal_feature_flags (id, label, enabled, target_role) VALUES
  ('press.applications',  'Press Portal Applications',          TRUE, 'journalist'),
  ('press.zip_download',  'Press Kit ZIP Download',             TRUE, 'journalist'),
  ('press.audio_preview', 'Promo Track In-Browser Preview',     TRUE, 'journalist'),
  ('press.contact',       'Press Inquiry Form',                 TRUE, 'journalist')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- artist_assets — files uploaded by artists via the portal
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artist_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  r2_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_assets_select_own" ON public.artist_assets;
DROP POLICY IF EXISTS "artist_assets_insert_own" ON public.artist_assets;
DROP POLICY IF EXISTS "artist_assets_delete_own" ON public.artist_assets;
DROP POLICY IF EXISTS "artist_assets_admin_all" ON public.artist_assets;

-- Allows artists to read their own asset entries
CREATE POLICY "artist_assets_select_own" ON public.artist_assets
  FOR SELECT USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

-- Allows artists to add asset entries for their own profile
CREATE POLICY "artist_assets_insert_own" ON public.artist_assets
  FOR INSERT WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

-- Allows artists to delete their own asset entries
CREATE POLICY "artist_assets_delete_own" ON public.artist_assets
  FOR DELETE USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

-- Allows admins full access to all artist assets
CREATE POLICY "artist_assets_admin_all" ON public.artist_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- artist_replies — artist replies to label messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artist_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.label_messages(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0),
  body_html TEXT,
  deleted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_replies
  ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE public.artist_replies
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.artist_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_replies_select_own" ON public.artist_replies;
DROP POLICY IF EXISTS "artist_replies_insert_own" ON public.artist_replies;
DROP POLICY IF EXISTS "artist_replies_admin_all" ON public.artist_replies;

-- Allows artists to read their own message replies
CREATE POLICY "artist_replies_select_own" ON public.artist_replies
  FOR SELECT USING (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

-- Allows artists to write replies to messages addressed to them
CREATE POLICY "artist_replies_insert_own" ON public.artist_replies
  FOR INSERT WITH CHECK (
    artist_id IN (SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid())
  );

-- Allows admins full access to all artist message replies
CREATE POLICY "artist_replies_admin_all" ON public.artist_replies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE public.label_messages REPLICA IDENTITY FULL;
ALTER TABLE public.artist_replies REPLICA IDENTITY FULL;

-- TABLE: message_templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  subject    TEXT        NOT NULL DEFAULT '',
  body_html  TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_templates: admin all" ON public.message_templates;
-- Allows admins full access to reusable message templates
CREATE POLICY "message_templates: admin all" ON public.message_templates
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ============================================================
-- TABLE: media_folders  (dedicated filesystem for Press & Media tab)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES public.media_folders(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent_id ON public.media_folders(parent_id);

-- ---------------------------------------------------------------------------
-- TABLE: media_files  (DEPRECATED — migrated to assets; kept for backfill only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_files (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  filename          TEXT    NOT NULL,
  original_filename TEXT    NOT NULL,
  mime_type         TEXT    NOT NULL,
  size_bytes        BIGINT  NOT NULL,
  r2_key            TEXT    NOT NULL UNIQUE,
  public_url        TEXT    NOT NULL,
  uploaded_by       UUID    REFERENCES public.users(id) ON DELETE SET NULL,
  folder_id         UUID    REFERENCES public.media_folders(id) ON DELETE SET NULL,
  artist_id         UUID    REFERENCES public.artists(id) ON DELETE SET NULL,
  tags              TEXT[]  NOT NULL DEFAULT '{}',
  sha256_hash       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_files_folder_id   ON public.media_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_files_created_at  ON public.media_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_files_sha256_hash ON public.media_files(sha256_hash);
ALTER TABLE public.media_files ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;

-- RLS: media_folders
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "media_folders: authenticated read"          ON public.media_folders;
DROP POLICY IF EXISTS "media_folders: editor+ write"               ON public.media_folders;
DROP POLICY IF EXISTS "media_folders: admin delete"                ON public.media_folders;
DROP POLICY IF EXISTS "media_folders: editor+ update"              ON public.media_folders;
DROP POLICY IF EXISTS "media_folders: can_view_admin_panel write"  ON public.media_folders;
DROP POLICY IF EXISTS "media_folders: can_view_admin_panel update" ON public.media_folders;
-- Allows any authenticated user to browse media folders
CREATE POLICY "media_folders: authenticated read"          ON public.media_folders FOR SELECT TO authenticated USING (true);
-- Requires can_view_admin_panel permission
CREATE POLICY "media_folders: can_view_admin_panel write"  ON public.media_folders FOR INSERT TO authenticated WITH CHECK (
  public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
);
-- Allows only admins to delete media folders
CREATE POLICY "media_folders: admin delete"                ON public.media_folders FOR DELETE TO authenticated USING (
  public.get_my_role() = 'admin'
);
-- Requires can_view_admin_panel permission to rename/move media folders
CREATE POLICY "media_folders: can_view_admin_panel update" ON public.media_folders FOR UPDATE TO authenticated USING (
  public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
);

-- RLS: media_files
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "media_files: authenticated read"          ON public.media_files;
DROP POLICY IF EXISTS "media_files: editor+ write"               ON public.media_files;
DROP POLICY IF EXISTS "media_files: editor+ update"              ON public.media_files;
DROP POLICY IF EXISTS "media_files: admin delete"                ON public.media_files;
DROP POLICY IF EXISTS "media_files: can_view_admin_panel write"  ON public.media_files;
DROP POLICY IF EXISTS "media_files: can_view_admin_panel update" ON public.media_files;
-- Allows any authenticated user to browse media files
CREATE POLICY "media_files: authenticated read"          ON public.media_files FOR SELECT TO authenticated USING (true);
-- Requires can_view_admin_panel permission
CREATE POLICY "media_files: can_view_admin_panel write"  ON public.media_files FOR INSERT TO authenticated WITH CHECK (
  public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
);
-- Requires can_view_admin_panel permission to update media file metadata
CREATE POLICY "media_files: can_view_admin_panel update" ON public.media_files FOR UPDATE TO authenticated USING (
  public.has_permission('can_view_admin_panel') OR public.get_my_role() = 'admin'
);
-- Allows only admins to delete media files
CREATE POLICY "media_files: admin delete"                ON public.media_files FOR DELETE TO authenticated USING (
  public.get_my_role() = 'admin'
);

-- Scheduled news: promoted to published on public cache refresh (see publishScheduledNewsPosts).
-- Query-time visibility also allows status=scheduled when published_at <= NOW().
-- Unschedule legacy pg_cron job if it was created manually:
--   SELECT cron.unschedule('publish-scheduled-news');

-- =============================================================================
-- AUDIT TABLES: role_changes & ban_history
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER: get_linked_artist_id — returns one artist.id for a given user
-- DEPRECATED: use get_linked_artist_ids() for multi-artist support.
-- Kept for backward compatibility with existing callers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_linked_artist_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT artist_id FROM public.artist_members WHERE user_id = p_user_id LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- HELPER: get_linked_artist_ids — returns ALL artist IDs for a given user
-- Supports the many-to-many artist_members relationship.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_linked_artist_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT artist_id FROM public.artist_members WHERE user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- HELPER: is_artist_member — true if the user has at least one artist membership
-- Used in RLS policies to grant portal access independently of profiles.role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_artist_member(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.artist_members WHERE user_id = p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- TABLE: role_changes
-- Immutable audit log: every change to profiles.role is recorded here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_changes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_role    TEXT        NOT NULL,
  new_role    TEXT        NOT NULL,
  changed_by  UUID        NOT NULL REFERENCES auth.users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT,
  ip_address  INET
);

CREATE INDEX IF NOT EXISTS idx_role_changes_user_id    ON public.role_changes (user_id);
CREATE INDEX IF NOT EXISTS idx_role_changes_changed_at ON public.role_changes (changed_at DESC);

ALTER TABLE public.role_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_changes: admin read" ON public.role_changes;
DROP POLICY IF EXISTS "role_changes: admin insert" ON public.role_changes;

CREATE POLICY "role_changes: admin read" ON public.role_changes
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "role_changes: admin insert" ON public.role_changes
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-log every profiles.role update into role_changes
-- Uses auth.uid() to capture the acting admin; falls back to user_id itself
-- when the update runs in a SECURITY DEFINER context without a session user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by UUID;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    v_changed_by := COALESCE(auth.uid(), NEW.id);
    INSERT INTO public.role_changes (user_id, old_role, new_role, changed_by)
    VALUES (NEW.id, OLD.role::TEXT, NEW.role::TEXT, v_changed_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_role_change ON public.users;
CREATE TRIGGER trg_log_role_change
  AFTER UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.log_role_change();

-- ---------------------------------------------------------------------------
-- TABLE: ban_history
-- Immutable audit log: every ban/unban action is recorded here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ban_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned       BOOLEAN     NOT NULL,
  banned_until TIMESTAMPTZ,
  changed_by   UUID        NOT NULL REFERENCES auth.users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ban_history_user_id    ON public.ban_history (user_id);
CREATE INDEX IF NOT EXISTS idx_ban_history_changed_at ON public.ban_history (changed_at DESC);

ALTER TABLE public.ban_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ban_history: admin read"   ON public.ban_history;
DROP POLICY IF EXISTS "ban_history: admin insert" ON public.ban_history;

CREATE POLICY "ban_history: admin read" ON public.ban_history
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "ban_history: admin insert" ON public.ban_history
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- =============================================================================
-- CUSTOM ROLES & PERMISSIONS (user-defined, supplemental to the system enum)
-- =============================================================================

-- TABLE: custom_permission_definitions
-- User-defined permission keys that can be assigned to custom roles.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_permission_definitions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,  -- machine key, e.g. 'can_export_data'
  label       TEXT        NOT NULL,          -- display label
  description TEXT,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS custom_permission_definitions_updated_at ON public.custom_permission_definitions;
CREATE TRIGGER custom_permission_definitions_updated_at
  BEFORE UPDATE ON public.custom_permission_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.custom_permission_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custom_permission_definitions: admin read"   ON public.custom_permission_definitions;
DROP POLICY IF EXISTS "custom_permission_definitions: admin write"  ON public.custom_permission_definitions;

CREATE POLICY "custom_permission_definitions: admin read"  ON public.custom_permission_definitions
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "custom_permission_definitions: admin write" ON public.custom_permission_definitions
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- TABLE: custom_roles
-- User-defined roles, supplementary to the system user_role enum.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,  -- machine key, e.g. 'moderator'
  label       TEXT        NOT NULL,          -- display name
  description TEXT,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS custom_roles_updated_at ON public.custom_roles;
CREATE TRIGGER custom_roles_updated_at
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custom_roles: admin read"  ON public.custom_roles;
DROP POLICY IF EXISTS "custom_roles: admin write" ON public.custom_roles;

DROP POLICY IF EXISTS "custom_roles: assigned read" ON public.custom_roles;
CREATE POLICY "custom_roles: assigned read" ON public.custom_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_custom_roles ucr
      WHERE ucr.role_id = custom_roles.id
        AND ucr.user_id = auth.uid()
    )
  );

CREATE POLICY "custom_roles: admin read"  ON public.custom_roles
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "custom_roles: admin write" ON public.custom_roles
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- TABLE: custom_role_permissions
-- Maps custom roles to permission names (both system and custom-defined keys).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_role_permissions (
  role_id         UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  permission_name TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_name)
);

ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custom_role_permissions: admin read"  ON public.custom_role_permissions;
DROP POLICY IF EXISTS "custom_role_permissions: admin write" ON public.custom_role_permissions;

DROP POLICY IF EXISTS "custom_role_permissions: assigned read" ON public.custom_role_permissions;
CREATE POLICY "custom_role_permissions: assigned read" ON public.custom_role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_custom_roles ucr
      WHERE ucr.role_id = custom_role_permissions.role_id
        AND ucr.user_id = auth.uid()
    )
  );

CREATE POLICY "custom_role_permissions: admin read"  ON public.custom_role_permissions
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "custom_role_permissions: admin write" ON public.custom_role_permissions
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- TABLE: user_custom_roles
-- Assigns custom roles to users (supplementary to profiles.role).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_custom_roles (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user_id ON public.user_custom_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_role_id ON public.user_custom_roles (role_id);

ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_custom_roles: admin read"  ON public.user_custom_roles;
DROP POLICY IF EXISTS "user_custom_roles: admin write" ON public.user_custom_roles;

DROP POLICY IF EXISTS "user_custom_roles: own read" ON public.user_custom_roles;
CREATE POLICY "user_custom_roles: own read" ON public.user_custom_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_custom_roles: admin read"  ON public.user_custom_roles
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "user_custom_roles: admin write" ON public.user_custom_roles
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- =============================================================================
-- RBAC AUDIT LOG
-- Comprehensive, append-only log of all RBAC changes:
--   - System role permission updates (trigger)
--   - Custom role / custom permission CRUD (written by API)
--   - User custom role assignments / revocations (written by API)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rbac_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,  -- e.g. 'permission_change', 'custom_role_created'
  target_type TEXT        NOT NULL,  -- 'system_role' | 'custom_role' | 'custom_permission' | 'user_custom_role'
  target_id   TEXT,                  -- role name, UUID, or user id
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_created_at  ON public.rbac_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_actor_id    ON public.rbac_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_target_type ON public.rbac_audit_log (target_type);

ALTER TABLE public.rbac_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rbac_audit_log: admin read"   ON public.rbac_audit_log;
DROP POLICY IF EXISTS "rbac_audit_log: admin insert" ON public.rbac_audit_log;

CREATE POLICY "rbac_audit_log: admin read"   ON public.rbac_audit_log
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "rbac_audit_log: admin insert" ON public.rbac_audit_log
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- TRIGGER: auto-log every update to role_permissions into rbac_audit_log
CREATE OR REPLACE FUNCTION public.log_permission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rbac_audit_log (actor_id, action, target_type, target_id, old_value, new_value)
  VALUES (
    COALESCE(NEW.updated_by, auth.uid()),
    'permission_change',
    'system_role',
    NEW.role::TEXT,
    (to_jsonb(OLD) - 'updated_at' - 'updated_by'),
    (to_jsonb(NEW) - 'updated_at' - 'updated_by')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_permission_change ON public.role_permissions;
CREATE TRIGGER trg_log_permission_change
  AFTER UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

-- =============================================================================
-- ADMIN AUDIT LOG
-- General-purpose, append-only log for all admin panel actions.
-- Written by API routes; read by admin users only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,   -- verb: 'created', 'updated', 'deleted', 'banned', etc.
  resource    TEXT        NOT NULL,   -- table/domain: 'artists', 'releases', 'users', etc.
  resource_id TEXT,                   -- PK of the affected row (if applicable)
  details     JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id    ON public.admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_resource    ON public.admin_audit_log (resource);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_audit_log: admin read"   ON public.admin_audit_log;
DROP POLICY IF EXISTS "admin_audit_log: admin insert" ON public.admin_audit_log;

CREATE POLICY "admin_audit_log: admin read"   ON public.admin_audit_log
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "admin_audit_log: admin insert" ON public.admin_audit_log
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- =============================================================================
-- RESOURCE OWNERSHIP: artist-own-read RLS for releases and concerts
-- Artists may read their own releases (including is_visible=false, pending review)
-- and their own concerts regardless of the artist's is_visible status.
-- Admins/editors bypass this via the existing "editor+ read all" policies.
-- =============================================================================

-- releases: artist own read (must be dropped/re-created idempotently)
DROP POLICY IF EXISTS "releases: artist own read" ON public.releases;
CREATE POLICY "releases: artist own read" ON public.releases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = artist_id
        AND am.user_id = auth.uid()
    )
  );

-- concerts: artist own read (supplements the existing public-read-visible policy)
DROP POLICY IF EXISTS "concerts: artist own read" ON public.concerts;
CREATE POLICY "concerts: artist own read" ON public.concerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = artist_id
        AND am.user_id = auth.uid()
    )
  );

-- =============================================================================
-- SUBMISSION SYSTEM (release submissions, video submissions, form schema)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM: submission_status
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.submission_status AS ENUM ('received', 'reviewed', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- TABLE: release_submissions
-- Artist-submitted release drafts for label review. Separate from the public
-- releases catalog — the label decides when to promote a submission to a release.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.release_submissions (
  id                  UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id           UUID                      NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  status              public.submission_status  NOT NULL DEFAULT 'received',
  title               TEXT                      NOT NULL,
  release_date        DATE,
  type                public.release_type,
  genre               TEXT,
  catalog_number      TEXT,
  isrc                TEXT,
  label_copy          TEXT,
  audio_download_url  TEXT                      NOT NULL,
  cover_art_url       TEXT                      NOT NULL,
  cover_art_verified  BOOLEAN                   NOT NULL DEFAULT FALSE,
  spotify_url         TEXT,
  apple_music_url     TEXT,
  youtube_url         TEXT,
  notes               TEXT,
  form_data           JSONB,
  admin_reply         TEXT,
  admin_reply_at      TIMESTAMPTZ,
  -- Label-facing progress text shown to the artist (e.g. "Cover approved, DSP delivery pending")
  progress_note       TEXT,
  -- Linked catalog release when label creates a draft from this submission
  release_id          UUID                      REFERENCES public.releases (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

ALTER TABLE public.release_submissions ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES public.releases (id) ON DELETE SET NULL;
ALTER TABLE public.release_submissions ADD COLUMN IF NOT EXISTS progress_note TEXT;

CREATE INDEX IF NOT EXISTS idx_release_submissions_artist_id ON public.release_submissions (artist_id);
CREATE INDEX IF NOT EXISTS idx_release_submissions_status    ON public.release_submissions (status);
CREATE INDEX IF NOT EXISTS idx_release_submissions_created   ON public.release_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_submissions_release_id ON public.release_submissions (release_id);

DROP TRIGGER IF EXISTS trg_release_submissions_updated_at ON public.release_submissions;
CREATE TRIGGER trg_release_submissions_updated_at
  BEFORE UPDATE ON public.release_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: release_submission_tracks
-- Per-track metadata for release submissions (albums, EPs, compilations, singles).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.release_submission_tracks (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id         UUID        NOT NULL REFERENCES public.release_submissions (id) ON DELETE CASCADE,
  track_number          INTEGER     NOT NULL,
  title                 TEXT,
  isrc                  TEXT,
  composer              TEXT,
  author                TEXT,
  genre                 TEXT,
  language              TEXT,
  gema                  BOOLEAN,
  explicit              BOOLEAN,
  live                  BOOLEAN,
  cover                 BOOLEAN,
  instrumental          BOOLEAN,
  preview_start_seconds INTEGER,
  duration_seconds      INTEGER,
  form_data             JSONB,
  display_order         INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_submission_tracks_submission
  ON public.release_submission_tracks (submission_id, display_order);

-- Atomic insert: release_submissions + tracks (service_role after membership check)
CREATE OR REPLACE FUNCTION public.create_release_submission_with_tracks(
  p_submission JSONB,
  p_tracks JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_track JSONB;
  v_i INT := 0;
BEGIN
  INSERT INTO public.release_submissions (
    artist_id,
    title,
    audio_download_url,
    cover_art_url,
    cover_art_verified,
    release_date,
    type,
    genre,
    catalog_number,
    isrc,
    label_copy,
    spotify_url,
    apple_music_url,
    youtube_url,
    notes,
    form_data
  ) VALUES (
    (p_submission->>'artist_id')::uuid,
    p_submission->>'title',
    p_submission->>'audio_download_url',
    p_submission->>'cover_art_url',
    COALESCE((p_submission->>'cover_art_verified')::boolean, false),
    NULLIF(p_submission->>'release_date', '')::date,
    NULLIF(p_submission->>'type', '')::public.release_type,
    NULLIF(p_submission->>'genre', ''),
    NULLIF(p_submission->>'catalog_number', ''),
    NULLIF(p_submission->>'isrc', ''),
    NULLIF(p_submission->>'label_copy', ''),
    NULLIF(p_submission->>'spotify_url', ''),
    NULLIF(p_submission->>'apple_music_url', ''),
    NULLIF(p_submission->>'youtube_url', ''),
    NULLIF(p_submission->>'notes', ''),
    CASE
      WHEN p_submission ? 'form_data' AND p_submission->'form_data' IS NOT NULL
        AND jsonb_typeof(p_submission->'form_data') = 'object'
      THEN p_submission->'form_data'
      ELSE NULL
    END
  )
  RETURNING id INTO v_id;

  IF p_tracks IS NOT NULL AND jsonb_typeof(p_tracks) = 'array' THEN
    FOR v_track IN SELECT * FROM jsonb_array_elements(p_tracks)
    LOOP
      INSERT INTO public.release_submission_tracks (
        submission_id,
        track_number,
        display_order,
        title,
        isrc,
        composer,
        author,
        genre,
        language,
        gema,
        explicit,
        live,
        cover,
        instrumental,
        preview_start_seconds,
        duration_seconds,
        form_data
      ) VALUES (
        v_id,
        COALESCE((v_track->>'track_number')::int, v_i + 1),
        COALESCE((v_track->>'display_order')::int, v_i),
        NULLIF(v_track->>'title', ''),
        NULLIF(v_track->>'isrc', ''),
        NULLIF(v_track->>'composer', ''),
        NULLIF(v_track->>'author', ''),
        NULLIF(v_track->>'genre', ''),
        NULLIF(v_track->>'language', ''),
        CASE WHEN v_track ? 'gema' THEN (v_track->>'gema')::boolean ELSE NULL END,
        CASE WHEN v_track ? 'explicit' THEN (v_track->>'explicit')::boolean ELSE NULL END,
        CASE WHEN v_track ? 'live' THEN (v_track->>'live')::boolean ELSE NULL END,
        CASE WHEN v_track ? 'cover' THEN (v_track->>'cover')::boolean ELSE NULL END,
        CASE WHEN v_track ? 'instrumental' THEN (v_track->>'instrumental')::boolean ELSE NULL END,
        CASE WHEN v_track ? 'preview_start_seconds' THEN (v_track->>'preview_start_seconds')::int ELSE NULL END,
        CASE WHEN v_track ? 'duration_seconds' THEN (v_track->>'duration_seconds')::int ELSE NULL END,
        CASE
          WHEN v_track ? 'form_data' AND jsonb_typeof(v_track->'form_data') = 'object'
          THEN v_track->'form_data'
          ELSE NULL
        END
      );
      v_i := v_i + 1;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_release_submission_with_tracks(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_release_submission_with_tracks(JSONB, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- TABLE: video_submissions
-- Artist-submitted music video drafts for label/YouTube processing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_submissions (
  id                    UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id             UUID                      NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  status                public.submission_status  NOT NULL DEFAULT 'received',
  title                 TEXT                      NOT NULL,
  description           TEXT,
  download_url          TEXT                      NOT NULL,
  thumbnail_url         TEXT,
  youtube_title         TEXT,
  youtube_description   TEXT,
  youtube_tags          TEXT[]                    NOT NULL DEFAULT '{}',
  youtube_category      TEXT,
  target_publish_date   DATE,
  notes                 TEXT,
  form_data             JSONB,
  admin_reply           TEXT,
  admin_reply_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_submissions_artist_id ON public.video_submissions (artist_id);
CREATE INDEX IF NOT EXISTS idx_video_submissions_status    ON public.video_submissions (status);
CREATE INDEX IF NOT EXISTS idx_video_submissions_created   ON public.video_submissions (created_at DESC);

DROP TRIGGER IF EXISTS trg_video_submissions_updated_at ON public.video_submissions;
CREATE TRIGGER trg_video_submissions_updated_at
  BEFORE UPDATE ON public.video_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: submission_form_schema
-- Admin-configurable field definitions for the release and video submission forms.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_form_schema (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_type            TEXT        NOT NULL CHECK (form_type IN ('release', 'video')),
  field_key            TEXT        NOT NULL,
  field_label_en       TEXT        NOT NULL,
  field_label_de       TEXT        NOT NULL,
  field_type           TEXT        NOT NULL CHECK (field_type IN (
    'text', 'url', 'date', 'date_dmy', 'select', 'textarea', 'boolean',
    'number', 'year', 'ean', 'isrc', 'duration', 'seconds', 'email'
  )),
  field_scope          TEXT        NOT NULL DEFAULT 'release' CHECK (field_scope IN ('release', 'track')),
  field_group          TEXT,
  field_options        JSONB,
  visibility_condition JSONB,
  type_rules           JSONB,
  validation           JSONB,
  is_required          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_visible           BOOLEAN     NOT NULL DEFAULT TRUE,
  display_order        INTEGER     NOT NULL DEFAULT 0,
  placeholder_en       TEXT,
  placeholder_de       TEXT,
  UNIQUE (form_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_submission_form_schema_type  ON public.submission_form_schema (form_type);
CREATE INDEX IF NOT EXISTS idx_submission_form_schema_order ON public.submission_form_schema (form_type, display_order);

-- Migrate legacy JSONB columns (field_labels / placeholders) to per-locale TEXT columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'submission_form_schema' AND column_name = 'field_labels'
  ) THEN
    ALTER TABLE public.submission_form_schema
      ADD COLUMN IF NOT EXISTS field_label_en TEXT,
      ADD COLUMN IF NOT EXISTS field_label_de TEXT,
      ADD COLUMN IF NOT EXISTS placeholder_en TEXT,
      ADD COLUMN IF NOT EXISTS placeholder_de TEXT;

    UPDATE public.submission_form_schema
    SET field_label_en = COALESCE(field_label_en, field_labels->>'en', field_key),
        field_label_de = COALESCE(field_label_de, field_labels->>'de', field_key),
        placeholder_en = COALESCE(placeholder_en, placeholders->>'en'),
        placeholder_de = COALESCE(placeholder_de, placeholders->>'de')
    WHERE field_labels IS NOT NULL OR placeholders IS NOT NULL;

    ALTER TABLE public.submission_form_schema DROP COLUMN IF EXISTS field_labels;
    ALTER TABLE public.submission_form_schema DROP COLUMN IF EXISTS placeholders;
  END IF;

  -- Repair columns dropped by an earlier partial migration (PR #443).
  ALTER TABLE public.submission_form_schema
    ADD COLUMN IF NOT EXISTS field_label_en TEXT,
    ADD COLUMN IF NOT EXISTS field_label_de TEXT,
    ADD COLUMN IF NOT EXISTS placeholder_en TEXT,
    ADD COLUMN IF NOT EXISTS placeholder_de TEXT,
    ADD COLUMN IF NOT EXISTS field_scope TEXT NOT NULL DEFAULT 'release',
    ADD COLUMN IF NOT EXISTS field_group TEXT,
    ADD COLUMN IF NOT EXISTS visibility_condition JSONB,
    ADD COLUMN IF NOT EXISTS type_rules JSONB,
    ADD COLUMN IF NOT EXISTS validation JSONB;
END $$;

ALTER TABLE public.submission_form_schema
  ADD COLUMN IF NOT EXISTS type_rules JSONB;

-- ---------------------------------------------------------------------------
-- TABLE: submission_release_type_rules
-- Per release-type track count behaviour for the artist submission form.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_release_type_rules (
  id               UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  release_type     TEXT    NOT NULL UNIQUE CHECK (release_type IN ('single', 'ep', 'album', 'compilation')),
  track_count_mode TEXT    NOT NULL CHECK (track_count_mode IN ('fixed_1', 'user_specified')),
  min_tracks       INTEGER NOT NULL DEFAULT 1 CHECK (min_tracks >= 1),
  max_tracks       INTEGER NOT NULL DEFAULT 99 CHECK (max_tracks >= 1),
  display_order    INTEGER NOT NULL DEFAULT 0,
  CHECK (max_tracks >= min_tracks)
);

INSERT INTO public.submission_release_type_rules
  (release_type, track_count_mode, min_tracks, max_tracks, display_order)
VALUES
  ('single',      'fixed_1',        1,  1,  10),
  ('ep',          'user_specified', 2,  6,  20),
  ('album',       'user_specified', 2, 99,  30),
  ('compilation', 'user_specified', 2, 99,  40)
ON CONFLICT (release_type) DO NOTHING;

-- Expand field_type check to include date_dmy (DD/MM/YYYY release date input).
ALTER TABLE public.submission_form_schema DROP CONSTRAINT IF EXISTS submission_form_schema_field_type_check;
ALTER TABLE public.submission_form_schema ADD CONSTRAINT submission_form_schema_field_type_check
  CHECK (field_type IN (
    'text', 'url', 'date', 'date_dmy', 'select', 'textarea', 'boolean',
    'number', 'year', 'ean', 'isrc', 'duration', 'seconds', 'email'
  ));

UPDATE public.submission_form_schema
SET field_type = 'date_dmy',
    placeholder_en = COALESCE(placeholder_en, 'DD/MM/YYYY'),
    placeholder_de = COALESCE(placeholder_de, 'TT/MM/JJJJ')
WHERE form_type = 'release' AND field_key = 'release_date' AND field_type = 'date';

-- Seed default schema for release form
INSERT INTO public.submission_form_schema
  (form_type, field_key, field_label_en, field_label_de, field_type, field_scope, field_group, field_options, is_required, is_visible, display_order, placeholder_en, placeholder_de)
VALUES
  ('release', 'title',              'Release Title',       'Release-Titel',         'text',     'release', 'metadata',     NULL, TRUE,  TRUE,  10, 'My New Album', 'Mein neues Album'),
  ('release', 'artist_name',        'Artist Name',         'Künstlername',          'text',     'release', 'metadata',     NULL, FALSE, TRUE,  15, NULL, NULL),
  ('release', 'release_date',       'Release Date',        'Veröffentlichungsdatum','date_dmy', 'release', 'metadata',     NULL, TRUE,  TRUE,  20, 'DD/MM/YYYY', 'TT/MM/JJJJ'),
  ('release', 'type',               'Release Type',        'Release-Typ',           'select',   'release', 'metadata',
    '{"options":[{"value":"single","labels":{"en":"Single","de":"Single"}},{"value":"ep","labels":{"en":"EP","de":"EP"}},{"value":"album","labels":{"en":"Album","de":"Album"}},{"value":"compilation","labels":{"en":"Compilation","de":"Compilation"}}]}',
    TRUE, TRUE, 30, NULL, NULL),
  ('release', 'prod_year',          'Prod Year',           'Produktionsjahr',       'year',     'release', 'metadata',     NULL, FALSE, TRUE,  35, NULL, NULL),
  ('release', 'genre',              'Genre',               'Genre',                 'text',     'release', 'metadata',     NULL, FALSE, TRUE,  40, 'e.g. Techno, House', 'z.B. Techno, House'),
  ('release', 'language',           'Language',            'Sprache',               'text',     'release', 'metadata',     NULL, FALSE, TRUE,  45, NULL, NULL),
  ('release', 'audio_download_url', 'Audio Download Link', 'Audio-Download-Link',   'url',      'release', 'distribution', NULL, TRUE,  TRUE,  50, 'https://drive.google.com/...', 'https://drive.google.com/...'),
  ('release', 'cover_art_url',      'Cover Art URL',       'Cover-Art-URL',         'url',      'release', 'distribution', NULL, TRUE,  TRUE,  60, 'https://drive.google.com/...', 'https://drive.google.com/...'),
  ('release', 'catalog_number',     'Catalogue Number',    'Katalognummer',         'text',     'release', 'metadata',     NULL, FALSE, TRUE,  70, 'DT-001', 'DT-001'),
  ('release', 'ean',                'EAN',                 'EAN',                   'ean',      'release', 'metadata',     NULL, FALSE, TRUE,  75, NULL, NULL),
  ('release', 'isrc',               'ISRC (release)',      'ISRC (Release)',        'isrc',     'release', 'metadata',     NULL, FALSE, TRUE,  80, 'DE-XXX-24-00001', 'DE-XXX-24-00001'),
  ('release', 'label_copy',         'Label Copy / Credits','Label-Text / Credits',  'textarea', 'release', 'rights',       NULL, FALSE, TRUE,  90, NULL, NULL),
  ('release', 'gema_release',       'GEMA',                'GEMA',                  'boolean',  'release', 'rights',       NULL, FALSE, TRUE,  95, NULL, NULL),
  ('release', 'spotify_url',        'Spotify Link',        'Spotify-Link',          'url',      'release', 'distribution', NULL, FALSE, TRUE, 100, NULL, NULL),
  ('release', 'apple_music_url',    'Apple Music Link',    'Apple Music-Link',      'url',      'release', 'distribution', NULL, FALSE, TRUE, 110, NULL, NULL),
  ('release', 'youtube_url',        'YouTube Link',        'YouTube-Link',          'url',      'release', 'distribution', NULL, FALSE, TRUE, 120, NULL, NULL),
  ('release', 'notes',              'Additional Notes',    'Zusätzliche Hinweise',  'textarea', 'release', 'metadata',     NULL, FALSE, TRUE, 130, NULL, NULL),
  ('release', 'track_number',       'Track Nr',            'Track-Nr.',             'number',   'track',   'track',        NULL, FALSE, FALSE, 200, NULL, NULL),
  ('release', 'song_title',         'Song Title',          'Songtitel',             'text',     'track',   'track',        NULL, TRUE,  TRUE, 210, NULL, NULL),
  ('release', 'track_isrc',         'ISRC',                'ISRC',                  'isrc',     'track',   'track',        NULL, FALSE, TRUE, 220, NULL, NULL),
  ('release', 'composer',           'Composer',            'Komponist',             'text',     'track',   'track',        NULL, FALSE, TRUE, 230, NULL, NULL),
  ('release', 'author',             'Author',              'Autor',                 'text',     'track',   'track',        NULL, FALSE, TRUE, 240, NULL, NULL),
  ('release', 'track_genre',        'Genre',               'Genre',                 'text',     'track',   'track',        NULL, FALSE, TRUE, 250, NULL, NULL),
  ('release', 'track_language',     'Language',            'Sprache',               'text',     'track',   'track',        NULL, FALSE, TRUE, 260, NULL, NULL),
  ('release', 'gema_track',         'GEMA',                'GEMA',                  'boolean',  'track',   'rights',       NULL, FALSE, TRUE, 270, NULL, NULL),
  ('release', 'explicit',           'Explicit',            'Explicit',              'boolean',  'track',   'rights',       NULL, FALSE, TRUE, 280, NULL, NULL),
  ('release', 'live',               'Live',                'Live',                  'boolean',  'track',   'rights',       NULL, FALSE, TRUE, 290, NULL, NULL),
  ('release', 'cover_version',      'Cover',               'Cover',                 'boolean',  'track',   'rights',       NULL, FALSE, TRUE, 300, NULL, NULL),
  ('release', 'instrumental',       'Instrumental',        'Instrumental',          'boolean',  'track',   'rights',       NULL, FALSE, TRUE, 310, NULL, NULL),
  ('release', 'preview_start_seconds', 'Preview Start (seconds)', 'Preview-Start (Sekunden)', 'seconds', 'track', 'distribution', NULL, FALSE, TRUE, 320, NULL, NULL),
  ('release', 'duration',           'Duration',            'Dauer',                 'duration', 'track',   'track',        NULL, FALSE, TRUE, 330, 'HH:MM:SS', 'HH:MM:SS')
ON CONFLICT (form_type, field_key) DO NOTHING;

-- Seed default schema for video form
INSERT INTO public.submission_form_schema
  (form_type, field_key, field_label_en, field_label_de, field_type, field_scope, field_group, field_options, is_required, is_visible, display_order, placeholder_en, placeholder_de)
VALUES
  ('video', 'title',               'Video Title',             'Video-Titel',                    'text',     'release', 'metadata',NULL, TRUE,  TRUE,  10, 'My Music Video', 'Mein Musikvideo'),
  ('video', 'download_url',        'Video Download Link',     'Video-Download-Link',            'url',      'release', 'metadata',NULL, TRUE,  TRUE,  20, 'https://drive.google.com/...', 'https://drive.google.com/...'),
  ('video', 'thumbnail_url',       'Thumbnail URL',           'Thumbnail-URL',                  'url',      'release', 'metadata',NULL, FALSE, TRUE,  30, NULL, NULL),
  ('video', 'youtube_title',       'YouTube Title',           'YouTube-Titel',                  'text',     'release', 'metadata',NULL, FALSE, TRUE,  40, NULL, NULL),
  ('video', 'youtube_description', 'YouTube Description',     'YouTube-Beschreibung',           'textarea', 'release', 'metadata',NULL, FALSE, TRUE,  50, NULL, NULL),
  ('video', 'youtube_tags',        'YouTube Tags',            'YouTube-Tags',                   'text',     'release', 'metadata',NULL, FALSE, TRUE,  60, 'techno, club, dj', 'techno, club, dj'),
  ('video', 'youtube_category',    'YouTube Category',        'YouTube-Kategorie',              'select',   'release', 'metadata',
    '{"options":[{"value":"10","labels":{"en":"Music","de":"Musik"}},{"value":"24","labels":{"en":"Entertainment","de":"Unterhaltung"}},{"value":"22","labels":{"en":"People & Blogs","de":"People & Blogs"}},{"value":"27","labels":{"en":"Education","de":"Bildung"}}]}',
    FALSE, TRUE, 70, NULL, NULL),
  ('video', 'target_publish_date', 'Target Publish Date',     'Geplantes Veröffentlichungsdatum','date',     'release', 'metadata', NULL, FALSE, TRUE,  80, NULL, NULL),
  ('video', 'description',         'Video Description',       'Video-Beschreibung',             'textarea', 'release', 'metadata',NULL, FALSE, TRUE,  90, NULL, NULL),
  ('video', 'notes',               'Additional Notes',        'Zusätzliche Hinweise',           'textarea', 'release', 'metadata',NULL, FALSE, TRUE, 100, NULL, NULL)
ON CONFLICT (form_type, field_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS for submission tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.release_submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_submission_tracks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_submissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_form_schema           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_release_type_rules    ENABLE ROW LEVEL SECURITY;

-- release_submissions: artist can insert/read own rows
DROP POLICY IF EXISTS "release_submissions: artist insert own" ON public.release_submissions;
CREATE POLICY "release_submissions: artist insert own" ON public.release_submissions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "release_submissions: artist read own" ON public.release_submissions;
CREATE POLICY "release_submissions: artist read own" ON public.release_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "release_submissions: editor+ read all" ON public.release_submissions;
CREATE POLICY "release_submissions: editor+ read all" ON public.release_submissions
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS "release_submissions: editor+ update" ON public.release_submissions;
CREATE POLICY "release_submissions: editor+ update" ON public.release_submissions
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'editor'));

-- release_submission_tracks: artist insert/read via submission ownership
DROP POLICY IF EXISTS "release_submission_tracks: artist insert own" ON public.release_submission_tracks;
CREATE POLICY "release_submission_tracks: artist insert own" ON public.release_submission_tracks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.release_submissions rs
      JOIN public.artist_members am ON am.artist_id = rs.artist_id
      WHERE rs.id = submission_id AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "release_submission_tracks: artist read own" ON public.release_submission_tracks;
CREATE POLICY "release_submission_tracks: artist read own" ON public.release_submission_tracks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.release_submissions rs
      JOIN public.artist_members am ON am.artist_id = rs.artist_id
      WHERE rs.id = submission_id AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "release_submission_tracks: editor+ read all" ON public.release_submission_tracks;
CREATE POLICY "release_submission_tracks: editor+ read all" ON public.release_submission_tracks
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

-- video_submissions: same pattern
DROP POLICY IF EXISTS "video_submissions: artist insert own" ON public.video_submissions;
CREATE POLICY "video_submissions: artist insert own" ON public.video_submissions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "video_submissions: artist read own" ON public.video_submissions;
CREATE POLICY "video_submissions: artist read own" ON public.video_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = artist_id AND am.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "video_submissions: editor+ read all" ON public.video_submissions;
CREATE POLICY "video_submissions: editor+ read all" ON public.video_submissions
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS "video_submissions: editor+ update" ON public.video_submissions;
CREATE POLICY "video_submissions: editor+ update" ON public.video_submissions
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'editor'));

-- submission_form_schema: public read, editor+ write
DROP POLICY IF EXISTS "submission_form_schema: public read" ON public.submission_form_schema;
CREATE POLICY "submission_form_schema: public read" ON public.submission_form_schema
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "submission_form_schema: editor+ write" ON public.submission_form_schema;
CREATE POLICY "submission_form_schema: editor+ write" ON public.submission_form_schema
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- submission_release_type_rules: public read, editor+ write
DROP POLICY IF EXISTS "submission_release_type_rules: public read" ON public.submission_release_type_rules;
CREATE POLICY "submission_release_type_rules: public read" ON public.submission_release_type_rules
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "submission_release_type_rules: editor+ write" ON public.submission_release_type_rules;
CREATE POLICY "submission_release_type_rules: editor+ write" ON public.submission_release_type_rules
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- TABLE: submission_form_drafts
-- In-progress portal submission wizards (release / video). One draft per
-- user+artist+form_type. Payload is JSON (values, tracks, step, etc.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_form_drafts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  form_type   TEXT        NOT NULL CHECK (form_type IN ('release', 'video')),
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, user_id, form_type)
);

CREATE INDEX IF NOT EXISTS idx_submission_form_drafts_artist
  ON public.submission_form_drafts (artist_id);

DROP TRIGGER IF EXISTS trg_submission_form_drafts_updated_at ON public.submission_form_drafts;
CREATE TRIGGER trg_submission_form_drafts_updated_at
  BEFORE UPDATE ON public.submission_form_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.submission_form_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submission_form_drafts: member all own" ON public.submission_form_drafts;
CREATE POLICY "submission_form_drafts: member all own" ON public.submission_form_drafts
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = submission_form_drafts.artist_id AND am.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = submission_form_drafts.artist_id AND am.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- TABLE: portal_faq_categories / portal_faq_items
-- Admin-managed FAQ for the Artist Portal (/portal/help, shown above static help).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_faq_categories (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT        NOT NULL UNIQUE,
  title_en     TEXT        NOT NULL,
  title_de     TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_published BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.portal_faq_items (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID        NOT NULL REFERENCES public.portal_faq_categories (id) ON DELETE CASCADE,
  slug            TEXT        NOT NULL UNIQUE,
  question_en     TEXT        NOT NULL,
  question_de     TEXT,
  answer_html_en  TEXT        NOT NULL,
  answer_html_de  TEXT,
  keywords        TEXT[]      NOT NULL DEFAULT '{}',
  portal_route    TEXT,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  is_published    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_faq_categories_order ON public.portal_faq_categories (sort_order);
CREATE INDEX IF NOT EXISTS idx_portal_faq_items_category_order ON public.portal_faq_items (category_id, sort_order);

DROP TRIGGER IF EXISTS trg_portal_faq_categories_updated_at ON public.portal_faq_categories;
CREATE TRIGGER trg_portal_faq_categories_updated_at
  BEFORE UPDATE ON public.portal_faq_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_portal_faq_items_updated_at ON public.portal_faq_items;
CREATE TRIGGER trg_portal_faq_items_updated_at
  BEFORE UPDATE ON public.portal_faq_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_faq_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_faq_items       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_faq_categories: published read" ON public.portal_faq_categories;
CREATE POLICY "portal_faq_categories: published read" ON public.portal_faq_categories
  FOR SELECT USING (is_published = TRUE);

DROP POLICY IF EXISTS "portal_faq_categories: editor+ write" ON public.portal_faq_categories;
CREATE POLICY "portal_faq_categories: editor+ write" ON public.portal_faq_categories
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS "portal_faq_items: published read" ON public.portal_faq_items;
CREATE POLICY "portal_faq_items: published read" ON public.portal_faq_items
  FOR SELECT USING (
    is_published = TRUE
    AND EXISTS (
      SELECT 1 FROM public.portal_faq_categories c
      WHERE c.id = portal_faq_items.category_id AND c.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS "portal_faq_items: editor+ write" ON public.portal_faq_items;
CREATE POLICY "portal_faq_items: editor+ write" ON public.portal_faq_items
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- Curated seed: 7 categories, 2–4 FAQ items each (EN required, DE on ~50%).
INSERT INTO public.portal_faq_categories (id, slug, title_en, title_de, sort_order)
VALUES
  ('a1000001-0001-4000-8000-000000000001', 'dashboard',     'Dashboard & Analytics', 'Dashboard & Analytics', 10),
  ('a1000001-0001-4000-8000-000000000002', 'music',         'Music & Presence',      'Musik & Präsenz',       20),
  ('a1000001-0001-4000-8000-000000000003', 'live',          'Live & Touring',        'Live & Touring',        30),
  ('a1000001-0001-4000-8000-000000000004', 'finance',       'Finance',               'Finanzen',              40),
  ('a1000001-0001-4000-8000-000000000005', 'communication', 'Communication',         'Kommunikation',         50),
  ('a1000001-0001-4000-8000-000000000006', 'files',         'Files & Documents',     'Dateien & Dokumente',   60),
  ('a1000001-0001-4000-8000-000000000007', 'account',       'Account & Access',      'Konto & Zugang',        70)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.portal_faq_items
  (category_id, slug, question_en, question_de, answer_html_en, answer_html_de, keywords, portal_route, sort_order)
VALUES
  ('a1000001-0001-4000-8000-000000000001', 'what-dashboard-shows',
   'What does the portal dashboard show?',
   'Was zeigt das Portal-Dashboard?',
   '<p>The dashboard is your home screen after sign-in. It summarizes KPIs, profile completion, intelligence insights, and shortcuts to the most important tasks for the active artist.</p>',
   '<p>Das Dashboard ist dein Startbildschirm nach dem Login. Es fasst KPIs, Profil-Vervollständigung, Intelligence-Hinweise und Shortcuts zu den wichtigsten Aufgaben für den aktiven Artist zusammen.</p>',
   ARRAY['dashboard', 'overview', 'kpi', 'übersicht'], '/portal', 10),

  ('a1000001-0001-4000-8000-000000000001', 'switch-between-artists',
   'How do I switch between multiple artists?',
   NULL,
   '<p>Use the artist switcher in the portal header. Each roster act has its own data scope—analytics, messages, and documents always reflect the currently selected artist.</p>',
   NULL,
   ARRAY['multi artist', 'roster', 'artistId', 'wechseln'], NULL, 20),

  ('a1000001-0001-4000-8000-000000000001', 'analytics-empty',
   'Why is my analytics data empty?',
   'Warum sind meine Analytics-Daten leer?',
   '<p>Empty charts usually mean data has not synced yet, filters are too narrow, or the analytics module is disabled for your act. Try widening the date range and confirm the correct artist is selected.</p>',
   '<p>Leere Charts bedeuten meist, dass Daten noch nicht synchronisiert wurden, Filter zu eng sind oder Analytics für deinen Act deaktiviert ist. Erweitere den Datumsbereich und prüfe den Artist-Switcher.</p>',
   ARRAY['analytics', 'no data', 'keine daten'], '/portal/analytics', 30),

  ('a1000001-0001-4000-8000-000000000002', 'submit-release',
   'How do I submit a new release?',
   'Wie reiche ich ein neues Release ein?',
   '<p>Open <strong>Releases → New submission</strong>, complete the schema-driven form, attach required assets, and submit. Your label reviews the request and may request changes via Messages.</p>',
   '<p>Öffne <strong>Releases → Neue Einreichung</strong>, fülle das Formular aus, hänge erforderliche Assets an und sende ab. Das Label prüft die Anfrage und kann Rückfragen per Messages stellen.</p>',
   ARRAY['release', 'submission', 'einreichung'], '/portal/releases/new', 10),

  ('a1000001-0001-4000-8000-000000000002', 'what-is-epk-builder',
   'What is the EPK Builder?',
   NULL,
   '<p>The EPK Builder lets you assemble a press-ready electronic press kit with bio, photos, streaming links, and downloadable assets. Changes can be previewed before sharing the public EPK URL.</p>',
   NULL,
   ARRAY['epk', 'press kit', 'press'], '/portal/epk-builder', 20),

  ('a1000001-0001-4000-8000-000000000002', 'fan-page-basics',
   'How does the fan page work?',
   'Wie funktioniert die Fan Page?',
   '<p>The fan page is your customizable landing page for fans. Edit blocks in the builder, request review from the label, and publish when approved. Preview links respect draft vs. published state.</p>',
   '<p>Die Fan Page ist deine anpassbare Landing Page für Fans. Bearbeite Blöcke im Builder, fordere ein Label-Review an und veröffentliche nach Freigabe.</p>',
   ARRAY['fan page', 'landing'], '/portal/fan-page', 30),

  ('a1000001-0001-4000-8000-000000000003', 'create-event',
   'How do I add a concert or event?',
   'Wie lege ich ein Konzert oder Event an?',
   '<p>Go to <strong>Events</strong> and create a new entry with date, venue, and ticketing links. Events can feed tour planning and analytics event overlays.</p>',
   '<p>Gehe zu <strong>Events</strong> und erstelle einen Eintrag mit Datum, Venue und Ticket-Links. Events können Tour-Planung und Analytics-Overlays speisen.</p>',
   ARRAY['event', 'concert', 'konzert'], '/portal/events', 10),

  ('a1000001-0001-4000-8000-000000000003', 'tour-planner-intro',
   'What is the Tour Planner?',
   NULL,
   '<p>The Tour Planner helps you map routes, stops, crew, merch, and tech documents for a tour. It works offline once loaded and syncs when you are back online.</p>',
   NULL,
   ARRAY['tour', 'routing', 'offline'], '/portal/tour-planner', 20),

  ('a1000001-0001-4000-8000-000000000004', 'what-is-sos',
   'What is a Statement of Sales (SOS)?',
   'Was ist ein Statement of Sales (SOS)?',
   '<p>An SOS is an official royalty statement from your label for a sales period. Use <strong>Statements</strong> to download PDFs and reconcile amounts with analytics earnings trends.</p>',
   '<p>Ein SOS ist ein offizielles Royalty-Statement des Labels für einen Abrechnungszeitraum. Unter <strong>Statements</strong> findest du PDFs zur Abstimmung mit Analytics.</p>',
   ARRAY['sos', 'statement', 'royalty', 'abrechnung'], '/portal/statements', 10),

  ('a1000001-0001-4000-8000-000000000004', 'find-invoices',
   'Where do I find my invoices?',
   NULL,
   '<p>Portal invoices live under <strong>Finance → Invoices</strong>. You can create draft invoices, track status, and download PDFs when issued.</p>',
   NULL,
   ARRAY['invoice', 'billing', 'rechnung'], '/portal/invoices', 20),

  ('a1000001-0001-4000-8000-000000000005', 'contact-label',
   'How do I contact the label?',
   'Wie kontaktiere ich das Label?',
   '<p>Use <strong>Messages</strong> for structured communication with the label team. For urgent matters, check your label contact details in profile or onboarding materials.</p>',
   '<p>Nutze <strong>Messages</strong> für strukturierte Kommunikation mit dem Label-Team. Dringende Fälle: Kontaktdaten im Profil oder Onboarding prüfen.</p>',
   ARRAY['messages', 'support', 'label'], '/portal/messages', 10),

  ('a1000001-0001-4000-8000-000000000005', 'interview-requests',
   'What are interview requests?',
   NULL,
   '<p>Interview requests are inbound press opportunities routed through the portal. Review details, accept or decline, and coordinate responses without leaving your artist workspace.</p>',
   NULL,
   ARRAY['interview', 'press', 'presse'], '/portal/interviews', 20),

  ('a1000001-0001-4000-8000-000000000006', 'upload-documents',
   'How do I upload documents?',
   'Wie lade ich Dokumente hoch?',
   '<p>Open <strong>Documents</strong>, choose a folder, and upload PDFs, riders, contracts, or images. Files are scoped to the active artist and can be downloaded later from the same view.</p>',
   '<p>Öffne <strong>Dokumente</strong>, wähle einen Ordner und lade PDFs, Rider, Verträge oder Bilder hoch. Dateien sind dem aktiven Artist zugeordnet.</p>',
   ARRAY['documents', 'upload', 'pdf', 'dokumente'], '/portal/documents', 10),

  ('a1000001-0001-4000-8000-000000000006', 'accepted-file-formats',
   'Which file formats are accepted?',
   NULL,
   '<p>Common formats include PDF, PNG, JPEG, and ZIP archives. Very large files may be rejected—check the upload error message or ask the label if you need an exception.</p>',
   NULL,
   ARRAY['file format', 'pdf', 'upload limit'], '/portal/documents', 20),

  ('a1000001-0001-4000-8000-000000000007', 'change-language',
   'How do I change the portal language?',
   'Wie ändere ich die Portal-Sprache?',
   '<p>Go to <strong>Settings</strong> and switch the language toggle. The portal stores your preference in a cookie and refreshes UI labels. FAQ answers fall back to English when no German translation exists.</p>',
   '<p>Gehe zu <strong>Einstellungen</strong> und wechsle die Sprache. FAQ-Antworten fallen auf Englisch zurück, wenn keine deutsche Übersetzung vorhanden ist.</p>',
   ARRAY['language', 'locale', 'sprache'], '/portal/settings', 10),

  ('a1000001-0001-4000-8000-000000000007', 'no-artist-linked',
   'What if my account shows no artist linked?',
   NULL,
   '<p>Complete onboarding or accept a label invite via <strong>Accept invite</strong>. If you still see no artist, contact the label so they can link your user to the correct roster profile.</p>',
   NULL,
   ARRAY['onboarding', 'invite', 'no artist', 'kein künstler'], '/portal/onboarding', 20)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE: artist_invoices  (performance fee / remix invoices, portal-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_invoices (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id              UUID         NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  invoice_number         TEXT         NOT NULL,
  artist_invoice_number  TEXT,
  statement_id           UUID         REFERENCES public.sales_statements (id) ON DELETE SET NULL,
  client_name            TEXT         NOT NULL,
  client_email           TEXT         NOT NULL,
  client_address         TEXT,
  line_items             JSONB        NOT NULL DEFAULT '[]',
  currency               VARCHAR(3)   NOT NULL DEFAULT 'EUR',
  tax_rate_pct           NUMERIC(5,2) NOT NULL DEFAULT 19.00,
  status                 TEXT         NOT NULL DEFAULT 'draft',
  due_date               DATE,
  issued_date            DATE         NOT NULL DEFAULT CURRENT_DATE,
  notes                  TEXT,
  pdf_url                TEXT,
  pdf_sha256             TEXT,
  service_period_start   DATE,
  service_period_end     DATE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, invoice_number)
);

ALTER TABLE public.artist_invoices ADD COLUMN IF NOT EXISTS pdf_sha256 TEXT;
ALTER TABLE public.artist_invoices ADD COLUMN IF NOT EXISTS service_period_start DATE;
ALTER TABLE public.artist_invoices ADD COLUMN IF NOT EXISTS service_period_end DATE;
-- ECB reference rate when invoice currency ≠ EUR (units of currency per 1 EUR)
ALTER TABLE public.artist_invoices ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18, 8);
ALTER TABLE public.artist_invoices ADD COLUMN IF NOT EXISTS fx_rate_date DATE;
ALTER TABLE public.artist_invoices ADD COLUMN IF NOT EXISTS fx_rate_source TEXT;

CREATE INDEX IF NOT EXISTS idx_artist_invoices_artist_id ON public.artist_invoices (artist_id);

DROP TRIGGER IF EXISTS trg_artist_invoices_updated_at ON public.artist_invoices;
CREATE TRIGGER trg_artist_invoices_updated_at
  BEFORE UPDATE ON public.artist_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.artist_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_invoices: artist read own"   ON public.artist_invoices;
CREATE POLICY "artist_invoices: artist read own" ON public.artist_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_invoices.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "artist_invoices: artist write own" ON public.artist_invoices;
CREATE POLICY "artist_invoices: artist write own" ON public.artist_invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_invoices.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_invoices.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "artist_invoices: admin all" ON public.artist_invoices;
CREATE POLICY "artist_invoices: admin all" ON public.artist_invoices
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- TABLE: artist_billing_profiles  (artist legal invoicing master data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_billing_profiles (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id          UUID         NOT NULL UNIQUE REFERENCES public.artists (id) ON DELETE CASCADE,
  legal_name         TEXT         NOT NULL DEFAULT '',
  street             TEXT         NOT NULL DEFAULT '',
  postal_code        TEXT         NOT NULL DEFAULT '',
  city               TEXT         NOT NULL DEFAULT '',
  country            TEXT         NOT NULL DEFAULT 'DE',
  tax_number         TEXT,
  vat_id             TEXT,
  is_small_business  BOOLEAN      NOT NULL DEFAULT FALSE,
  -- standard | small_business | reverse_charge (§ 14 UStG tax presentation)
  tax_status         TEXT         NOT NULL DEFAULT 'standard',
  iban               TEXT,
  bic                TEXT,
  paypal_email       TEXT,
  -- EU VIES (MIAS) validation snapshot for reverse-charge safety
  vat_vies_valid         BOOLEAN,
  vat_vies_checked_at    TIMESTAMPTZ,
  vat_vies_trader_name   TEXT,
  vat_vies_request_id    TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artist_billing_profiles ADD COLUMN IF NOT EXISTS tax_status TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE public.artist_billing_profiles ADD COLUMN IF NOT EXISTS vat_vies_valid BOOLEAN;
ALTER TABLE public.artist_billing_profiles ADD COLUMN IF NOT EXISTS vat_vies_checked_at TIMESTAMPTZ;
ALTER TABLE public.artist_billing_profiles ADD COLUMN IF NOT EXISTS vat_vies_trader_name TEXT;
ALTER TABLE public.artist_billing_profiles ADD COLUMN IF NOT EXISTS vat_vies_request_id TEXT;

UPDATE public.artist_billing_profiles
SET tax_status = CASE WHEN is_small_business THEN 'small_business' ELSE 'standard' END
WHERE tax_status IS NULL
   OR tax_status NOT IN ('standard', 'small_business', 'reverse_charge');

ALTER TABLE public.artist_billing_profiles DROP CONSTRAINT IF EXISTS artist_billing_profiles_tax_status_check;
ALTER TABLE public.artist_billing_profiles
  ADD CONSTRAINT artist_billing_profiles_tax_status_check
  CHECK (tax_status IN ('standard', 'small_business', 'reverse_charge'));

CREATE INDEX IF NOT EXISTS idx_artist_billing_profiles_artist_id ON public.artist_billing_profiles (artist_id);

DROP TRIGGER IF EXISTS trg_artist_billing_profiles_updated_at ON public.artist_billing_profiles;
CREATE TRIGGER trg_artist_billing_profiles_updated_at
  BEFORE UPDATE ON public.artist_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.artist_billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_billing_profiles: artist read own" ON public.artist_billing_profiles;
CREATE POLICY "artist_billing_profiles: artist read own" ON public.artist_billing_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_billing_profiles.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "artist_billing_profiles: artist write own" ON public.artist_billing_profiles;
CREATE POLICY "artist_billing_profiles: artist write own" ON public.artist_billing_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_billing_profiles.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_billing_profiles.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "artist_billing_profiles: admin all" ON public.artist_billing_profiles;
CREATE POLICY "artist_billing_profiles: admin all" ON public.artist_billing_profiles
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- TABLE: artist_documents  (contract vault — legal docs per artist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id        UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  label            TEXT        NOT NULL,
  category         TEXT        NOT NULL DEFAULT 'other',
  file_path        TEXT        NOT NULL,
  file_size_bytes  INTEGER,
  mime_type        TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_documents_artist_id ON public.artist_documents (artist_id);

DROP TRIGGER IF EXISTS trg_artist_documents_updated_at ON public.artist_documents;
CREATE TRIGGER trg_artist_documents_updated_at
  BEFORE UPDATE ON public.artist_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.artist_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_documents: artist read own"  ON public.artist_documents;
CREATE POLICY "artist_documents: artist read own" ON public.artist_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_documents.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "artist_documents: artist write own" ON public.artist_documents;
CREATE POLICY "artist_documents: artist write own" ON public.artist_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_documents.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_documents.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "artist_documents: admin all" ON public.artist_documents;
CREATE POLICY "artist_documents: admin all" ON public.artist_documents
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- TABLE: portal_feedback  (artist product feedback about portal / site)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('bug', 'feature', 'ux', 'general', 'praise')),
  rating      SMALLINT    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  subject     TEXT,
  message     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'reviewed', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_feedback_status_created
  ON public.portal_feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_feedback_artist_created
  ON public.portal_feedback (artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_feedback_created
  ON public.portal_feedback (created_at DESC);

DROP TRIGGER IF EXISTS trg_portal_feedback_updated_at ON public.portal_feedback;
CREATE TRIGGER trg_portal_feedback_updated_at
  BEFORE UPDATE ON public.portal_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_feedback: artist insert own" ON public.portal_feedback;
CREATE POLICY "portal_feedback: artist insert own" ON public.portal_feedback
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = portal_feedback.artist_id
        AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portal_feedback: artist read own" ON public.portal_feedback;
CREATE POLICY "portal_feedback: artist read own" ON public.portal_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members am
      WHERE am.artist_id = portal_feedback.artist_id
        AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portal_feedback: editor+ read all" ON public.portal_feedback;
CREATE POLICY "portal_feedback: editor+ read all" ON public.portal_feedback
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS "portal_feedback: editor+ update" ON public.portal_feedback;
CREATE POLICY "portal_feedback: editor+ update" ON public.portal_feedback
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'editor'));

-- ===========================================================================
-- USER ROLES (multi-role junction table)  — added 2026-06
-- ===========================================================================

-- TABLE: user_roles — one row per (user, role) pair
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID             NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role       public.user_role NOT NULL,
  granted_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  granted_by UUID             REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role    ON public.user_roles (role);

-- Backfill: seed user_roles from existing profiles.role values (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.users
ON CONFLICT (user_id, role) DO NOTHING;

-- TRIGGER: after user_roles changes, keep profiles.role = highest-privilege role
-- Privilege order: admin > editor > journalist > artist > user
CREATE OR REPLACE FUNCTION public.sync_primary_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_new_role public.user_role;
BEGIN
  -- Determine which user changed
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  -- Pick most-privileged remaining role (or default 'user')
  SELECT role INTO v_new_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  ORDER BY
    CASE role
      WHEN 'admin'      THEN 1
      WHEN 'editor'     THEN 2
      WHEN 'journalist' THEN 3
      WHEN 'press'      THEN 3
      WHEN 'artist'     THEN 4
      ELSE                   5
    END
  LIMIT 1;

  IF v_new_role IS NULL THEN
    v_new_role := 'user';
  END IF;

  UPDATE public.users SET role = v_new_role WHERE id = v_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_role ON public.user_roles;
CREATE TRIGGER trg_sync_primary_role
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_role();

-- RLS for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles: own read"  ON public.user_roles;
CREATE POLICY "user_roles: own read" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles: admin all" ON public.user_roles;
CREATE POLICY "user_roles: admin all" ON public.user_roles
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ===========================================================================
-- PORTAL MESSAGES — artist-to-artist and artist-to-label messaging
-- ===========================================================================

-- TABLE: portal_message_folders — per-artist custom folders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_message_folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id  UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT,
  icon       TEXT,
  position   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_msg_folders_artist ON public.portal_message_folders (artist_id);

ALTER TABLE public.portal_message_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_msg_folders: artist own" ON public.portal_message_folders;
CREATE POLICY "portal_msg_folders: artist own" ON public.portal_message_folders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = portal_message_folders.artist_id AND am.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = portal_message_folders.artist_id AND am.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "portal_msg_folders: admin all" ON public.portal_message_folders;
CREATE POLICY "portal_msg_folders: admin all" ON public.portal_message_folders
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- TABLE: portal_messages — outbound messages from artists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_artist_id  UUID        NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  to_artist_id    UUID        REFERENCES public.artists (id) ON DELETE SET NULL,
  to_label        BOOLEAN     NOT NULL DEFAULT FALSE,
  subject         TEXT        NOT NULL DEFAULT '',
  body            TEXT        NOT NULL DEFAULT '',
  body_html       TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ,
  starred         BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  folder_id       UUID        REFERENCES public.portal_message_folders (id) ON DELETE SET NULL,
  has_attachments BOOLEAN     NOT NULL DEFAULT FALSE,
  sender_user_id  UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  client_message_id UUID,
  search_vector   TSVECTOR    GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body,''))
  ) STORED
);

ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS client_message_id UUID;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_messages_client_message_id
  ON public.portal_messages (client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_messages_assignee
  ON public.portal_messages (assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_msg_from    ON public.portal_messages (from_artist_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_msg_to      ON public.portal_messages (to_artist_id,   sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_msg_search  ON public.portal_messages USING GIN(search_vector);

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

-- Sender can read/update/delete their own sent messages
DROP POLICY IF EXISTS "portal_messages: sender own" ON public.portal_messages;
CREATE POLICY "portal_messages: sender own" ON public.portal_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = from_artist_id AND am.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = from_artist_id AND am.user_id = auth.uid())
  );

-- Recipient artist members can read received messages
DROP POLICY IF EXISTS "portal_messages: recipient read" ON public.portal_messages;
CREATE POLICY "portal_messages: recipient read" ON public.portal_messages
  FOR SELECT USING (
    to_artist_id IS NOT NULL AND
    EXISTS (SELECT 1 FROM public.artist_members am WHERE am.artist_id = to_artist_id AND am.user_id = auth.uid())
  );

-- Admins can do everything (needed for label-side inbox view)
DROP POLICY IF EXISTS "portal_messages: admin all" ON public.portal_messages;
CREATE POLICY "portal_messages: admin all" ON public.portal_messages
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- TABLE: portal_message_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_message_attachments (
  id          UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID   NOT NULL REFERENCES public.portal_messages (id) ON DELETE CASCADE,
  file_url    TEXT   NOT NULL,
  file_name   TEXT   NOT NULL,
  file_size   BIGINT,
  mime_type   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_attach_msg ON public.portal_message_attachments (message_id);

ALTER TABLE public.portal_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_attach: via message sender" ON public.portal_message_attachments;
CREATE POLICY "portal_attach: via message sender" ON public.portal_message_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.portal_messages pm
      JOIN public.artist_members am ON am.artist_id = pm.from_artist_id
      WHERE pm.id = portal_message_attachments.message_id AND am.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_messages pm
      JOIN public.artist_members am ON am.artist_id = pm.from_artist_id
      WHERE pm.id = portal_message_attachments.message_id AND am.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portal_attach: admin all" ON public.portal_message_attachments;
CREATE POLICY "portal_attach: admin all" ON public.portal_message_attachments
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- =============================================================================
-- SOS (Statement-of-Sales) PERSISTENCE
-- Stores admin-configured rule presets and historical period summaries for the
-- SOS Generator accounting panel.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RLS: sos_rules_presets (table created earlier — before distributor_import_batches)
-- ---------------------------------------------------------------------------
ALTER TABLE public.sos_rules_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_rules_presets: admin all" ON public.sos_rules_presets;
CREATE POLICY "sos_rules_presets: admin all" ON public.sos_rules_presets
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP TRIGGER IF EXISTS sos_rules_presets_updated_at ON public.sos_rules_presets;
CREATE TRIGGER sos_rules_presets_updated_at
  BEFORE UPDATE ON public.sos_rules_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: sos_accounting_workspaces  — server-persisted live workspace for a period
-- Stores the full current rules bundle (as JSONB) + attached bronze batch IDs.
-- Enables collaborative retrieval of accounting configuration at any time.
-- Keyed by the same (period_start, period_end) strings used by bronze + summaries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_accounting_workspaces (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start     TEXT        NOT NULL,
  period_end       TEXT        NOT NULL,
  config           JSONB       NOT NULL DEFAULT '{}'::JSONB,
  bronze_batch_ids UUID[]      NOT NULL DEFAULT '{}',
  updated_by       UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_sos_accounting_workspaces_period ON public.sos_accounting_workspaces (period_start DESC, period_end);

ALTER TABLE public.sos_accounting_workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_accounting_workspaces: admin/editor all" ON public.sos_accounting_workspaces;
CREATE POLICY "sos_accounting_workspaces: admin/editor all" ON public.sos_accounting_workspaces
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

DROP TRIGGER IF EXISTS sos_accounting_workspaces_updated_at ON public.sos_accounting_workspaces;
CREATE TRIGGER sos_accounting_workspaces_updated_at
  BEFORE UPDATE ON public.sos_accounting_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: sos_period_summaries  — per-period aggregate revenue figures
-- Stores historical trend data: total revenue, payouts, and per-artist/platform
-- breakdowns as JSONB.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_period_summaries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start        TEXT        NOT NULL,
  period_end          TEXT        NOT NULL,
  total_revenue       NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_payout        NUMERIC(14, 4) NOT NULL DEFAULT 0,
  artist_count        INTEGER     NOT NULL DEFAULT 0,
  artist_breakdowns   JSONB       NOT NULL DEFAULT '[]'::JSONB,
  platform_breakdowns JSONB       NOT NULL DEFAULT '[]'::JSONB,
  source_batch_ids    UUID[]      NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sos_period_summaries_period_key
  ON public.sos_period_summaries (period_start, period_end);

ALTER TABLE public.sos_period_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_period_summaries: admin all" ON public.sos_period_summaries;
CREATE POLICY "sos_period_summaries: admin all" ON public.sos_period_summaries
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- ALTER TABLE guards for schema parity on existing databases
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'label_approved', 'artist_notified', 'acknowledged'));
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS label_notes TEXT;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS label_approved_at TIMESTAMPTZ;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS total_streams BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.distributor_import_batches (id) ON DELETE SET NULL;
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS lastfm_name TEXT;
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS soundcharts_id TEXT;
ALTER TABLE public.sos_period_summaries
  ADD COLUMN IF NOT EXISTS source_batch_ids UUID[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS sos_period_summaries_period_key
  ON public.sos_period_summaries (period_start, period_end);

ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS statement_id UUID REFERENCES public.sales_statements(id) ON DELETE SET NULL;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS artist_invoice_number TEXT;

-- ---------------------------------------------------------------------------
-- Settlement periods (label accounting register)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_periods (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  DATE         NOT NULL,
  period_end    DATE         NOT NULL,
  label         TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'under_review', 'approved', 'locked', 'archived')),
  notes         TEXT,
  locked_at     TIMESTAMPTZ,
  locked_by     UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  archived_at   TIMESTAMPTZ,
  archived_by   UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_settlement_periods_status ON public.settlement_periods (status);
CREATE INDEX IF NOT EXISTS idx_settlement_periods_dates  ON public.settlement_periods (period_start, period_end);

DROP TRIGGER IF EXISTS trg_settlement_periods_updated_at ON public.settlement_periods;
CREATE TRIGGER trg_settlement_periods_updated_at
  BEFORE UPDATE ON public.settlement_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settlement_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlement_periods: admin all" ON public.settlement_periods;
CREATE POLICY "settlement_periods: admin all" ON public.settlement_periods
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- Artist settlement ledger (append-only journal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_settlement_ledger (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id            UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  settlement_period_id UUID           REFERENCES public.settlement_periods (id) ON DELETE SET NULL,
  entry_type           TEXT           NOT NULL
                       CHECK (entry_type IN (
                         'statement_payout', 'invoice_liability', 'payment',
                         'carry_in', 'carry_out', 'correction', 'opening_balance', 'partial_payment'
                       )),
  amount_eur           NUMERIC(14, 4) NOT NULL,
  currency             VARCHAR(3),
  amount_original      NUMERIC(14, 4),
  fx_rate              NUMERIC(14, 6),
  reference_type       TEXT,
  reference_id         UUID,
  description          TEXT,
  created_by           UUID           REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_ledger_artist    ON public.artist_settlement_ledger (artist_id);
CREATE INDEX IF NOT EXISTS idx_settlement_ledger_period    ON public.artist_settlement_ledger (settlement_period_id);
CREATE INDEX IF NOT EXISTS idx_settlement_ledger_ref       ON public.artist_settlement_ledger (reference_type, reference_id);

ALTER TABLE public.artist_settlement_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlement_ledger: artist read own" ON public.artist_settlement_ledger;
CREATE POLICY "settlement_ledger: artist read own" ON public.artist_settlement_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = artist_settlement_ledger.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "settlement_ledger: admin all" ON public.artist_settlement_ledger;
CREATE POLICY "settlement_ledger: admin all" ON public.artist_settlement_ledger
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- Period carry-forwards (opening balances into next period)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.period_carry_forwards (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  from_period_id      UUID           NOT NULL REFERENCES public.settlement_periods (id) ON DELETE CASCADE,
  to_period_id        UUID           REFERENCES public.settlement_periods (id) ON DELETE SET NULL,
  artist_id           UUID           NOT NULL REFERENCES public.artists (id) ON DELETE CASCADE,
  opening_balance_eur NUMERIC(14, 4) NOT NULL DEFAULT 0,
  breakdown           JSONB          NOT NULL DEFAULT '{}',
  applied_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (from_period_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_carry_forwards_artist ON public.period_carry_forwards (artist_id);
CREATE INDEX IF NOT EXISTS idx_carry_forwards_to     ON public.period_carry_forwards (to_period_id);

ALTER TABLE public.period_carry_forwards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carry_forwards: artist read own" ON public.period_carry_forwards;
CREATE POLICY "carry_forwards: artist read own" ON public.period_carry_forwards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.artist_members
      WHERE artist_members.artist_id = period_carry_forwards.artist_id
        AND artist_members.user_id   = auth.uid()
    )
  );

DROP POLICY IF EXISTS "carry_forwards: admin all" ON public.period_carry_forwards;
CREATE POLICY "carry_forwards: admin all" ON public.period_carry_forwards
  FOR ALL USING (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- ---------------------------------------------------------------------------
-- Financial audit events (immutable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_audit_events (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT         NOT NULL,
  entity_id   UUID         NOT NULL,
  action      TEXT         NOT NULL,
  actor_id    UUID         REFERENCES auth.users (id) ON DELETE SET NULL,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_entity ON public.financial_audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_created ON public.financial_audit_events (created_at DESC);

ALTER TABLE public.financial_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_audit: admin read" ON public.financial_audit_events;
CREATE POLICY "financial_audit: admin read" ON public.financial_audit_events
  FOR SELECT USING (public.get_my_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS "financial_audit: admin insert" ON public.financial_audit_events;
CREATE POLICY "financial_audit: admin insert" ON public.financial_audit_events
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- Migrate legacy statement status
UPDATE public.sales_statements SET status = 'invoiced' WHERE status = 'acknowledged';

ALTER TABLE public.sales_statements DROP CONSTRAINT IF EXISTS sales_statements_status_check;
ALTER TABLE public.sales_statements ADD CONSTRAINT sales_statements_status_check
  CHECK (status IN (
    'draft', 'label_approved', 'artist_notified', 'viewed', 'invoiced', 'paid',
    'superseded', 'cancelled', 'acknowledged'
  ));

ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'original'
  CHECK (document_type IN ('original', 'correction', 'storno'));
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS correction_of_id UUID REFERENCES public.sales_statements (id) ON DELETE SET NULL;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES public.sales_statements (id) ON DELETE SET NULL;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS reporting_currency VARCHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS amount_reporting NUMERIC(14, 4);
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS fx_rate_to_eur NUMERIC(14, 6);
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS fx_rate_date DATE;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS fx_source TEXT;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS settlement_period_id UUID REFERENCES public.settlement_periods (id) ON DELETE SET NULL;
ALTER TABLE public.sales_statements
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.artist_invoices DROP CONSTRAINT IF EXISTS artist_invoices_status_check;
ALTER TABLE public.artist_invoices ADD CONSTRAINT artist_invoices_status_check
  CHECK (status IN ('draft', 'sent', 'received', 'partially_paid', 'paid', 'cancelled'));

ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS paid_amount_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS outstanding_amount_cents BIGINT;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IS NULL OR payment_method IN ('sepa', 'paypal', 'manual', 'other'));
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.artist_invoices
  ADD COLUMN IF NOT EXISTS settlement_period_id UUID REFERENCES public.settlement_periods (id) ON DELETE SET NULL;

ALTER TABLE public.sales_statement_line_items
  ADD COLUMN IF NOT EXISTS amount_original NUMERIC(14, 4);
ALTER TABLE public.sales_statement_line_items
  ADD COLUMN IF NOT EXISTS currency_original VARCHAR(3);
ALTER TABLE public.sales_statement_line_items
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(14, 6);
ALTER TABLE public.sales_statement_line_items
  ADD COLUMN IF NOT EXISTS fx_rate_date DATE;

-- =============================================================================
-- RLS: promo_log_entries (table created earlier — before promo_impact)
-- Admins/editors write; artists read their own timeline.
-- =============================================================================

ALTER TABLE public.promo_log_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_log: admin all"   ON public.promo_log_entries;
DROP POLICY IF EXISTS "promo_log: artist read" ON public.promo_log_entries;

-- Admins and editors can manage all entries
CREATE POLICY "promo_log: admin all" ON public.promo_log_entries
  FOR ALL
  USING  (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));

-- Artists can read only their own entries (strict data isolation)
CREATE POLICY "promo_log: artist read" ON public.promo_log_entries
  FOR SELECT
  USING (
    artist_id IN (
      SELECT artist_id FROM public.artist_members WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- DATA BACKFILL: press_photos + media_files → assets + press_kit_items
-- Idempotent — safe to re-run on existing databases.
-- =============================================================================
DO $$
DECLARE
  v_photo RECORD;
  v_media RECORD;
  v_asset_id UUID;
  v_ext TEXT;
  v_mime TEXT;
BEGIN
  -- Migrate legacy press_photos into assets + press_kit_items
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'press_photos'
  ) THEN
    FOR v_photo IN SELECT * FROM public.press_photos LOOP
      SELECT id INTO v_asset_id FROM public.assets WHERE r2_key = v_photo.r2_key LIMIT 1;

      IF v_asset_id IS NULL THEN
        v_ext := lower(regexp_replace(v_photo.r2_key, '.*(\.[^.]+)$', '\1'));
        v_mime := CASE v_ext
          WHEN '.png'  THEN 'image/png'
          WHEN '.webp' THEN 'image/webp'
          WHEN '.gif'  THEN 'image/gif'
          WHEN '.svg'  THEN 'image/svg+xml'
          WHEN '.pdf'  THEN 'application/pdf'
          ELSE 'image/jpeg'
        END;

        INSERT INTO public.assets (
          filename, original_filename, mime_type, size_bytes,
          r2_key, public_url, artist_id,
          alt_text, is_press_approved, press_category, downloadable_for_press,
          created_at
        ) VALUES (
          reverse(split_part(reverse(v_photo.r2_key), '/', 1)),
          v_photo.title,
          v_mime,
          0,
          v_photo.r2_key,
          v_photo.public_url,
          v_photo.artist_id,
          v_photo.alt_text,
          TRUE,
          v_photo.category,
          TRUE,
          v_photo.created_at
        )
        ON CONFLICT (r2_key) DO NOTHING
        RETURNING id INTO v_asset_id;

        IF v_asset_id IS NULL THEN
          SELECT id INTO v_asset_id FROM public.assets WHERE r2_key = v_photo.r2_key LIMIT 1;
        END IF;
      ELSE
        UPDATE public.assets SET
          alt_text              = COALESCE(alt_text, v_photo.alt_text),
          is_press_approved     = TRUE,
          press_category        = COALESCE(press_category, v_photo.category),
          downloadable_for_press = TRUE,
          artist_id             = COALESCE(artist_id, v_photo.artist_id),
          original_filename     = CASE
            WHEN original_filename = '' OR original_filename IS NULL THEN v_photo.title
            ELSE original_filename
          END
        WHERE id = v_asset_id;
      END IF;

      IF v_asset_id IS NOT NULL THEN
        IF v_photo.artist_id IS NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.press_kit_items
            WHERE asset_id = v_asset_id AND artist_id IS NULL
          ) THEN
            INSERT INTO public.press_kit_items (asset_id, artist_id, display_order)
            VALUES (v_asset_id, NULL, v_photo.display_order);
          END IF;
        ELSE
          IF NOT EXISTS (
            SELECT 1 FROM public.press_kit_items
            WHERE asset_id = v_asset_id AND artist_id = v_photo.artist_id
          ) THEN
            INSERT INTO public.press_kit_items (asset_id, artist_id, display_order)
            VALUES (v_asset_id, v_photo.artist_id, v_photo.display_order);
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Migrate legacy media_files into assets (no auto press-kit membership)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media_files'
  ) THEN
    FOR v_media IN SELECT * FROM public.media_files LOOP
      SELECT id INTO v_asset_id FROM public.assets WHERE r2_key = v_media.r2_key LIMIT 1;

      IF v_asset_id IS NULL THEN
        INSERT INTO public.assets (
          filename, original_filename, mime_type, size_bytes,
          r2_key, public_url, uploaded_by, folder_id, artist_id,
          tags, sha256_hash, created_at
        ) VALUES (
          v_media.filename,
          v_media.original_filename,
          v_media.mime_type,
          v_media.size_bytes,
          v_media.r2_key,
          v_media.public_url,
          v_media.uploaded_by,
          NULL,
          v_media.artist_id,
          v_media.tags,
          v_media.sha256_hash,
          v_media.created_at
        )
        ON CONFLICT (r2_key) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- =============================================================================
-- Backfill claims for all existing users
DO $$
DECLARE
  v_user RECORD;
  v_artist_id UUID;
BEGIN
  FOR v_user IN SELECT id, role::TEXT FROM public.users LOOP
    SELECT artist_id INTO v_artist_id FROM public.artist_members WHERE user_id = v_user.id LIMIT 1;
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_user.role, 'artist_id', v_artist_id)
    WHERE id = v_user.id;
  END LOOP;
END;
$$;
