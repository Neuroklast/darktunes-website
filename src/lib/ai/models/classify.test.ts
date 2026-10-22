import { describe, expect, it } from 'vitest'
import { classifyTurn } from '@/lib/ai/models/classify'

describe('classifyTurn', () => {
  it('keeps normal admin chat on the fast model', () => {
    expect(
      classifyTurn({
        text: 'How many releases are in the catalog?',
        accessContext: 'admin',
      }),
    ).toMatchObject({ role: 'fast', mode: 'auto' })
  })

  it('selects reasoning for multi-signal diagnostics', () => {
    expect(
      classifyTurn({
        text: 'Analyze why the provider timed out and correlate the error log with the last sync.',
        accessContext: 'admin',
      }),
    ).toMatchObject({ role: 'reasoning', reason: 'diagnostic' })
  })

  it('selects reasoning for an error reference', () => {
    expect(
      classifyTurn({
        text: 'Please explain error ERR-AB12CD34',
        accessContext: 'editor',
      }),
    ).toMatchObject({ role: 'reasoning', reason: 'diagnostic' })
  })

  it('never upgrades artist portal questions to reasoning automatically', () => {
    expect(
      classifyTurn({
        text: 'Analyze why my release failed and correlate the error log',
        accessContext: 'artist',
      }),
    ).toMatchObject({ role: 'fast', mode: 'auto' })
  })

  it('honours explicit fast and deep modes', () => {
    expect(
      classifyTurn({ text: 'Analyze this error', accessContext: 'admin', mode: 'fast' }),
    ).toMatchObject({ role: 'fast', reason: 'explicit' })
    expect(
      classifyTurn({ text: 'Hello', accessContext: 'admin', mode: 'deep' }),
    ).toMatchObject({ role: 'reasoning', reason: 'explicit' })
  })
})
