import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, beforeAll } from 'vitest'

let sql: string

beforeAll(() => {
  // resolve from the repo root (three levels up from tests/unit/db/)
  const resetPath = resolve(__dirname, '../../../supabase/reset.sql')
  sql = readFileSync(resetPath, 'utf-8')
})

describe('reset.sql — required tables', () => {
  it('contains CREATE TABLE artists', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.artists/)
  })

  it('contains CREATE TABLE news_posts', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.news_posts/)
  })

  it('contains CREATE TABLE releases', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.releases/)
  })

  it('contains CREATE TABLE site_settings', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.site_settings/)
  })

  it('contains CREATE TABLE role_permissions', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.role_permissions/)
  })

  it('contains submission_form_schema table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.submission_form_schema/)
  })

  it('contains AI assistant tables and token RPCs', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_conversations/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_token_budgets/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_settings/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.integration_outbox/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reserve_ai_tokens/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.settle_ai_tokens/)
    expect(sql).not.toMatch(/cron\.schedule/)
  })
})

describe('reset.sql — transactional AI credits', () => {
  it('contains additive private tables and accounting functions', () => {
    for (const table of ['ai_credit_settings', 'ai_credit_accounts', 'ai_credit_reservations', 'ai_credit_adjustments']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }
    for (const fn of ['reserve_ai_credits', 'settle_ai_credits', 'refund_ai_credit_turn', 'adjust_ai_credits', 'ai_credit_cost_summary', 'ai_usage_month_summary']) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`)
    }
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.reserve_ai_credits')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  })
})

describe('reset.sql — column presence', () => {
  it('artists table has an id column of type uuid', () => {
    // Find the CREATE TABLE artists block and confirm id uuid is there
    const artistsBlock = sql.match(
      /CREATE TABLE IF NOT EXISTS public\.artists[\s\S]+?(?=CREATE TABLE|CREATE INDEX|$)/,
    )
    expect(artistsBlock).toBeTruthy()
    expect(artistsBlock![0]).toMatch(/\bid\s+UUID/i)
  })

  it('site_settings table has a key column', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS public\.site_settings[\s\S]+?(?=CREATE TABLE|CREATE INDEX|$)/,
    )
    expect(block).toBeTruthy()
    expect(block![0]).toMatch(/\bkey\b/)
  })

  it('site_settings table has a value column', () => {
    const block = sql.match(
      /CREATE TABLE IF NOT EXISTS public\.site_settings[\s\S]+?(?=CREATE TABLE|CREATE INDEX|\Z)/,
    )
    expect(block).toBeTruthy()
    expect(block![0]).toMatch(/\bvalue\b/)
  })

  it('news_posts table has a status column', () => {
    // The column may be added via ALTER TABLE ... ADD COLUMN IF NOT EXISTS
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS status/)
  })
})

describe('reset.sql — seed data', () => {
  it('contains INSERT INTO site_settings (seed present)', () => {
    expect(sql).toMatch(/INSERT INTO (?:public\.)?site_settings/)
  })
})

describe('reset.sql — indexes', () => {
  it('contains at least one CREATE INDEX statement', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/)
  })

  it('has an index on artists.slug', () => {
    expect(sql).toMatch(/ON public\.artists\s*\(slug\)/)
  })

  it('has an index on news_posts.status', () => {
    expect(sql).toMatch(/ON public\.news_posts\s*\(status\)/)
  })
})
