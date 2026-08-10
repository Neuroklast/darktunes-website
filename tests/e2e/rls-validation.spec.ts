import { test, expect } from '@playwright/test'
import { Client } from 'pg'

const SENSITIVE_TABLES = [
  'artists',
  'releases',
  'users',
  'sales_statements',
  'artist_assets',
  'artist_billing_profiles',
  'promo_tracks',
]

test('RLS is enabled on all sensitive tables', async () => {
  const dbUrl = process.env.SUPABASE_DB_URL

  if (!dbUrl) {
    throw new Error(
      'Missing SUPABASE_DB_URL — run `npm run db:e2e:start` to provision the local Supabase stack.',
    )
  }

  // PostgREST only exposes the public/graphql_public schemas, so pg_catalog
  // (where table-level RLS status lives) isn't reachable via supabase-js —
  // a direct Postgres connection is required here.
  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    const { rows } = await client.query<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [SENSITIVE_TABLES],
    )

    const byTable = new Map(rows.map((row) => [row.tablename, row.rowsecurity]))

    for (const tableName of SENSITIVE_TABLES) {
      expect(byTable.has(tableName), `Table not found in pg_tables: ${tableName}`).toBe(true)
      expect(byTable.get(tableName), `RLS must be enabled for table: ${tableName}`).toBe(true)
    }
  } finally {
    await client.end()
  }
})
