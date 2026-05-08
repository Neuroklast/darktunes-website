-- =============================================================================
-- Migration : 20260508000000_artist_sync_schema.sql
-- Project   : darkTunes Music Group
-- Description: Artist Auto-Sync module — adds sync IDs and last_synced_at to
--              the artists table; creates sync_logs and concerts tables.
--
-- Apply via Supabase CLI:  supabase db push
-- Apply manually:          Paste into Supabase Dashboard → SQL Editor → Run
--
-- TypeScript types that mirror this schema live in src/types/database.ts.
-- IMPORTANT: Any change to this schema MUST be reflected here AND in
-- src/types/database.ts. See AGENTS.md "Database Schema Management".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend artists table with external API IDs and sync timestamp
-- ---------------------------------------------------------------------------
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS spotify_id       TEXT,
  ADD COLUMN IF NOT EXISTS discogs_id       TEXT,
  ADD COLUMN IF NOT EXISTS songkick_id      TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at   TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. TABLE: sync_logs  (audit trail for every artist sync run)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.sync_status AS ENUM ('pending', 'success', 'partial', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_trigger AS ENUM ('manual', 'cron');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id          UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id   UUID                  REFERENCES public.artists (id) ON DELETE CASCADE,
  triggered_by public.sync_trigger  NOT NULL DEFAULT 'manual',
  status      public.sync_status    NOT NULL DEFAULT 'pending',
  details     JSONB,
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_artist_id  ON public.sync_logs (artist_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON public.sync_logs (created_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_logs: admin read"
  ON public.sync_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "sync_logs: service insert"
  ON public.sync_logs FOR INSERT
  WITH CHECK (TRUE);

-- ---------------------------------------------------------------------------
-- 3. TABLE: concerts  (tour dates synced from Songkick)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.concert_status AS ENUM ('upcoming', 'past', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.concerts (
  id           UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id    UUID                   REFERENCES public.artists (id) ON DELETE CASCADE,
  artist_name  TEXT                   NOT NULL,
  event_name   TEXT                   NOT NULL,
  venue_name   TEXT,
  city         TEXT,
  country      TEXT,
  event_date   DATE                   NOT NULL,
  ticket_url   TEXT,
  songkick_id  TEXT                   UNIQUE,
  status       public.concert_status  NOT NULL DEFAULT 'upcoming',
  created_at   TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concerts_artist_id  ON public.concerts (artist_id);
CREATE INDEX IF NOT EXISTS idx_concerts_event_date ON public.concerts (event_date);
CREATE INDEX IF NOT EXISTS idx_concerts_status     ON public.concerts (status);

DROP TRIGGER IF EXISTS trg_concerts_updated_at ON public.concerts;
CREATE TRIGGER trg_concerts_updated_at
  BEFORE UPDATE ON public.concerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.concerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concerts: public read"
  ON public.concerts FOR SELECT USING (TRUE);

CREATE POLICY "concerts: editor+ insert"
  ON public.concerts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "concerts: editor+ update"
  ON public.concerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "concerts: admin delete"
  ON public.concerts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
