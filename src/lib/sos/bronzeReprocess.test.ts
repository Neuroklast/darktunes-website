import { describe, expect, it } from 'vitest'
import { buildReprocessConfig } from './bronzeReprocess'

describe('buildReprocessConfig', () => {
  it('forwards session FX and opening balances into the processor config', () => {
    const config = buildReprocessConfig({
      exchangeRates: { USD: 1.08 },
      historicalExchangeRates: { '2024-03': { USD: 1.1 } },
      carryForwardByArtist: { neuroklast: 12.5 },
    })

    expect(config.exchangeRates).toEqual({ USD: 1.08 })
    expect(config.historicalExchangeRates).toEqual({ '2024-03': { USD: 1.1 } })
    expect(config.carryForwardByArtist).toEqual({ neuroklast: 12.5 })
  })
})
