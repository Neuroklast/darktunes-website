import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, beforeAll } from 'vitest'

let sql: string

beforeAll(() => {
  sql = readFileSync(resolve(__dirname, '../../../supabase/reset.sql'), 'utf-8')
})

describe('reset.sql — cron jobs are dashboard-managed, not SQL-managed', () => {
  it('never registers a pg_cron job', () => {
    expect(sql).not.toMatch(/cron\.schedule\(/)
  })

  it('never unschedules a pg_cron job', () => {
    expect(sql).not.toMatch(/cron\.unschedule\(/)
  })

  it('never defines a trigger_sync_* wrapper function', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.trigger_sync_/)
  })

  it('never reads secrets from Vault', () => {
    expect(sql).not.toMatch(/vault\.decrypted_secrets/)
  })

  it('never calls pg_net directly', () => {
    expect(sql).not.toMatch(/net\.http_post/)
  })

  it('drops the legacy trigger_sync_*/get_vault_secret wrapper functions', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.trigger_sync_worker\(\)/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.trigger_sync_enqueue\(\)/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.trigger_sync_youtube\(\)/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_vault_secret\(TEXT\)/)
  })

  it('defines the atomic claim function using FOR UPDATE SKIP LOCKED', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_sync_jobs/)
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/)
  })

  it('defines the ledger, tick and lease tables with RLS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.sync_runs/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.cron_ticks/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.sync_worker_lease/)
    expect(sql).toMatch(/ALTER TABLE public\.sync_runs ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/ALTER TABLE public\.cron_ticks ENABLE ROW LEVEL SECURITY/)
  })

  it('does not reference the removed trigger-sync edge function', () => {
    expect(sql).not.toMatch(/trigger-sync/)
  })
})
