import { describe, expect, it } from 'vitest'
import { safeTechnical } from './safeTechnical'

describe('safeTechnical', () => {
  it('does not crash on legacy null or malformed metadata', () => {
    expect(safeTechnical(null)).toEqual({})
    expect(safeTechnical(undefined)).toEqual({})
    expect(safeTechnical('invalid')).toEqual({})
    expect(safeTechnical([])).toEqual({})
  })
  it('only exposes the allowed technical fields', () => {
    expect(safeTechnical({ model_role: 'fast', metrics: { duration: 25 }, secret: 'private' }))
      .toEqual({ model_role: 'fast', metrics: { duration: 25 } })
  })
})
