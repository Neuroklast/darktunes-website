import { describe, expect, it } from 'vitest'
import { calculateCredits } from './credits'

const price = { inputPerMillionEur: 0.2, outputPerMillionEur: 0.8 }
describe('calculateCredits', () => {
  it('charges by model-specific input and output rates', () => {
    expect(calculateCredits({ input_tokens: 4000, output_tokens: 1000, reasoning_tokens: 0 }, price)).toBe(2)
  })
  it('does not double count reasoning included in output', () => {
    expect(calculateCredits({ input_tokens: 0, output_tokens: 1000, reasoning_tokens: 500 }, { ...price, reasoningPerMillionEur: 1.6 }, { buffer: 0 })).toBe(2)
  })
  it('does not charge empty usage', () => {
    expect(calculateCredits({ input_tokens: 0, output_tokens: 0, reasoning_tokens: 0 }, price)).toBe(0)
  })
  it('rejects negative usage', () => {
    expect(() => calculateCredits({ input_tokens: -1, output_tokens: 0, reasoning_tokens: 0 }, price)).toThrow()
  })
})
