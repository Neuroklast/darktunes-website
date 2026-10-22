import { describe, expect, it } from 'vitest'
import { assistantErrorKey } from '@/lib/ai/presentation/errors'

describe('assistant error presentation', () => {
  it('never sends an artist to admin settings for provider failures', () => {
    expect(assistantErrorKey('AI_PROVIDER_INVALID_KEY', 'artist')).toBe('AI_UNAVAILABLE_ARTIST')
    expect(assistantErrorKey('AI_NOT_CONFIGURED', 'artist')).toBe('AI_DISABLED_ARTIST')
    expect(assistantErrorKey('AI_TOOL_FORBIDDEN', 'artist')).toBe('AI_ACCESS_ARTIST')
  })

  it('gives admins an actionable configuration hint without provider internals', () => {
    expect(assistantErrorKey('AI_PROVIDER_TIMEOUT', 'admin')).toBe('AI_UNAVAILABLE_ADMIN')
    expect(assistantErrorKey('AI_EMPTY_RESPONSE', 'admin')).toBe('AI_RETRY_ADMIN')
    expect(assistantErrorKey('AI_BUDGET_EXCEEDED', 'admin')).toBe('AI_LIMIT_ADMIN')
  })

  it('keeps safe, specific messages for ordinary authorization and data errors', () => {
    expect(assistantErrorKey('FORBIDDEN_NO_ARTIST', 'artist')).toBe('FORBIDDEN_NO_ARTIST')
    expect(assistantErrorKey('AI_ARTIST_FORBIDDEN', 'artist')).toBe('AI_ARTIST_FORBIDDEN')
    expect(assistantErrorKey('NOT_FOUND', 'editor')).toBe('NOT_FOUND')
  })

  it('maps editor provider failures to staff wording', () => {
    expect(assistantErrorKey('AI_PROVIDER_UNAVAILABLE', 'editor')).toBe('AI_UNAVAILABLE_STAFF')
    expect(assistantErrorKey('AI_STREAM_INCOMPLETE', 'editor')).toBe('AI_RETRY_STAFF')
  })
})
