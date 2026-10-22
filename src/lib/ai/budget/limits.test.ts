import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKEN_LIMITS, parseTokenLimits } from '@/lib/ai/budget/limits'

describe('token limit defaults', () => {
  it('should match the seeded JSON in reset.sql', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/reset.sql'), 'utf8')
    expect(sql).toContain('"max_input_tokens": 6000')
    expect(sql).toContain('"max_output_tokens": 1200')
    expect(sql).toContain('"max_turn_tokens": 10000')
    expect(sql).toContain('"day": 30000')
    expect(sql).toContain('"month": 3000000')
    expect(DEFAULT_TOKEN_LIMITS.global.month).toBe(3_000_000)
  })

  it('should fill missing keys from defaults', () => {
    const parsed = parseTokenLimits({ fast: { max_input_tokens: 100 } })
    expect(parsed.fast.max_input_tokens).toBe(100)
    expect(parsed.fast.max_output_tokens).toBe(1200)
    expect(parsed.roles.artist.day).toBe(30_000)
  })
})
