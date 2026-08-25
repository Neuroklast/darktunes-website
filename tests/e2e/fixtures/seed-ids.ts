/**
 * Fixed IDs/slugs for the deterministic fixtures inserted by supabase/seed.sql
 * into the local E2E Supabase stack. Keep in sync with that file by hand —
 * there are only a handful of rows.
 */
export const SEED_IDS = {
  artists: {
    visible: {
      id: 'e2e00000-0000-0000-0000-000000000001',
      slug: 'e2e-visible-artist',
      name: 'E2E Visible Artist',
    },
    hidden: {
      id: 'e2e00000-0000-0000-0000-000000000002',
      slug: 'e2e-hidden-artist',
      name: 'E2E Hidden Artist',
    },
  },
  releases: {
    album: {
      id: 'e2e00000-0000-0000-0000-000000000101',
      title: 'E2E Fixture Album',
    },
    single: {
      id: 'e2e00000-0000-0000-0000-000000000102',
      title: 'E2E Fixture Single',
    },
  },
  news: {
    public: {
      id: 'e2e00000-0000-0000-0000-000000000201',
      slug: 'e2e-public-news',
      title: 'E2E Public News Post',
    },
    pressOnly: {
      id: 'e2e00000-0000-0000-0000-000000000202',
      slug: 'e2e-press-only-news',
      title: 'E2E Press-Only News Post',
    },
  },
} as const
