-- supabase/e2e-fixtures.sql
-- Deterministic content fixtures for local E2E testing.
--
-- Applied by scripts/e2e-db-setup.mjs AFTER supabase/reset.sql, against the
-- Supabase CLI's local stack only (never against production/staging).
--
-- NOT named supabase/seed.sql on purpose: the Supabase CLI auto-runs a file
-- with that exact name during `supabase start`, before reset.sql has had a
-- chance to create the app schema — that fails immediately. This file is
-- applied manually, in the right order, by scripts/e2e-db-setup.mjs instead.
--
-- Every row uses a fixed UUID/slug so Playwright specs can reference known
-- fixtures directly instead of querying "whatever happens to exist". See
-- tests/e2e/fixtures/seed-ids.ts for the same constants from the test side.
--
-- Idempotent: safe to re-run against an already-seeded database
-- (ON CONFLICT (id) DO NOTHING — ids never change between runs).

-- ---------------------------------------------------------------------------
-- Artists
-- ---------------------------------------------------------------------------
-- image_url + spotify_url on the visible artist keep isProfileComplete()
-- (src/lib/api/artistProfiles.ts) satisfied, so authenticated-artist E2E
-- specs land on /portal instead of being redirected to /portal/onboarding.
INSERT INTO public.artists (id, name, slug, bio, genres, featured, country, is_visible, image_url, spotify_url)
VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'E2E Visible Artist', 'e2e-visible-artist',
   'Fixture artist used by Playwright E2E tests. Publicly visible.',
   ARRAY['industrial', 'ebm'], TRUE, 'DE', TRUE,
   'https://placehold.co/600x600.png', 'https://open.spotify.com/artist/e2e-fixture'),
  ('e2e00000-0000-0000-0000-000000000002', 'E2E Hidden Artist', 'e2e-hidden-artist',
   'Fixture artist used by Playwright E2E tests. Hidden from public listings (is_visible = false).',
   ARRAY['darkwave'], FALSE, 'DE', FALSE, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Releases (linked to the visible artist)
-- ---------------------------------------------------------------------------
INSERT INTO public.releases (id, title, artist_id, release_date, type, featured, is_visible)
VALUES
  ('e2e00000-0000-0000-0000-000000000101', 'E2E Fixture Album', 'e2e00000-0000-0000-0000-000000000001',
   '2026-01-15', 'album', TRUE, TRUE),
  ('e2e00000-0000-0000-0000-000000000102', 'E2E Fixture Single', 'e2e00000-0000-0000-0000-000000000001',
   '2026-03-01', 'single', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- News posts (one public, one press-only — covers the press-gated content path)
-- ---------------------------------------------------------------------------
INSERT INTO public.news_posts (id, title, slug, excerpt, content, status, is_press_only, artist_id)
VALUES
  ('e2e00000-0000-0000-0000-000000000201', 'E2E Public News Post', 'e2e-public-news',
   'Fixture news post used by Playwright E2E tests.',
   'Full body content for the E2E fixture public news post.', 'published', FALSE,
   'e2e00000-0000-0000-0000-000000000001'),
  ('e2e00000-0000-0000-0000-000000000202', 'E2E Press-Only News Post', 'e2e-press-only-news',
   'Fixture press-only news post used by Playwright E2E tests.',
   'Full body content for the E2E fixture press-only news post.', 'published', TRUE,
   'e2e00000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
