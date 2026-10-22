import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '@/lib/ai/prompts/system'

describe('assistant system prompt', () => {
  it('requires the active user language and forbids English-only tool jargon', () => {
    const prompt = buildSystemPrompt({
      accessContext: 'artist',
      artistName: 'Example Act',
      locale: 'de',
      page: { dashboard: 'portal', path: '/portal/statements', locale: 'de' },
    })

    expect(prompt).toContain('Always answer in German')
    expect(prompt).not.toMatch(/keep technical tool names/i)
    expect(prompt).toContain('Do not mention internal tool names')
    expect(prompt).toContain('do not describe the page as if you had read it')
  })

  it('explains missing artist linkage without promising data access', () => {
    const prompt = buildSystemPrompt({
      accessContext: 'artist',
      artistName: null,
      locale: 'en',
    })

    expect(prompt).toContain('no artist is linked to this account')
    expect(prompt).toContain('cannot read artist data')
    expect(prompt).not.toContain('You are talking to an artist about their own act')
  })

  it('treats admins without an artist as label-wide', () => {
    const prompt = buildSystemPrompt({
      accessContext: 'admin',
      dashboard: 'admin',
      artistName: null,
      locale: 'en',
    })

    expect(prompt).toContain('label-wide administration; no artist is selected')
    expect(prompt).toContain('without selecting an artist')
  })
})
