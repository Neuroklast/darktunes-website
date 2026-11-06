import { describe, expect, it } from 'vitest'
import {
  formatAccountingPeriodLabel,
  resolveAccountingPeriod,
} from './accountingPeriod'

describe('resolveAccountingPeriod', () => {
  it('prefers the manual period over the detected one', () => {
    const { period, error } = resolveAccountingPeriod({
      manualStart: '2026-01',
      manualEnd: '2026-03',
      detectedStart: '2023-08',
      detectedEnd: '2026-03',
    })

    expect(error).toBeNull()
    expect(period).toEqual({
      startMonth: '2026-01',
      endMonth: '2026-03',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      source: 'manual',
    })
  })

  it('treats a manual start without an end as a single month', () => {
    const { period } = resolveAccountingPeriod({
      manualStart: '2026-02',
      manualEnd: '',
      detectedStart: '2023-08',
      detectedEnd: '2026-03',
    })

    expect(period).toMatchObject({
      startMonth: '2026-02',
      endMonth: '2026-02',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      source: 'manual',
    })
  })

  it('rejects a manual end without a start instead of using detected months', () => {
    const { period, error } = resolveAccountingPeriod({
      manualStart: '',
      manualEnd: '2026-03',
      detectedStart: '2023-08',
      detectedEnd: '2026-03',
    })

    expect(period).toBeNull()
    expect(error).toBe('missing')
  })

  it('uses the detected period when nothing was selected manually', () => {
    const { period, error } = resolveAccountingPeriod({
      detectedStart: '2023-08',
      detectedEnd: '2026-03',
    })

    expect(error).toBeNull()
    expect(period).toMatchObject({
      startMonth: '2023-08',
      endMonth: '2026-03',
      startDate: '2023-08-01',
      endDate: '2026-03-31',
      source: 'detected',
    })
  })

  it('returns a missing error when no period is available', () => {
    expect(resolveAccountingPeriod({})).toEqual({ period: null, error: 'missing' })
    expect(
      resolveAccountingPeriod({ manualStart: ' ', manualEnd: '', detectedStart: '' }),
    ).toEqual({ period: null, error: 'missing' })
  })

  it('rejects invalid months instead of falling back to the detected period', () => {
    const invalid = ['2026-13', '2026-00', '2026-2', 'Q1-2026', 'garbage']

    for (const month of invalid) {
      const { period, error } = resolveAccountingPeriod({
        manualStart: month,
        manualEnd: '2026-03',
        detectedStart: '2023-08',
        detectedEnd: '2026-03',
      })
      expect(period).toBeNull()
      expect(error).toBe('invalid-month')
    }
  })

  it('rejects a reversed range', () => {
    const { period, error } = resolveAccountingPeriod({
      manualStart: '2026-03',
      manualEnd: '2026-01',
    })

    expect(period).toBeNull()
    expect(error).toBe('invalid-range')
  })

  it('resolves the last calendar day for leap and non-leap February', () => {
    expect(resolveAccountingPeriod({ detectedStart: '2024-02' }).period?.endDate).toBe(
      '2024-02-29',
    )
    expect(resolveAccountingPeriod({ detectedStart: '2026-02' }).period?.endDate).toBe(
      '2026-02-28',
    )
  })

  it('never invents a replacement period from the current year', () => {
    const { period, error } = resolveAccountingPeriod({
      manualStart: 'invalid',
      detectedStart: '2023-08',
      detectedEnd: '2026-03',
    })

    expect(period).toBeNull()
    expect(error).toBe('invalid-month')
  })
})

describe('formatAccountingPeriodLabel', () => {
  it('renders a single month once and a range with both months', () => {
    expect(
      formatAccountingPeriodLabel({
        startMonth: '2026-01',
        endMonth: '2026-01',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        source: 'manual',
      }),
    ).toBe('2026-01')

    expect(
      formatAccountingPeriodLabel({
        startMonth: '2026-01',
        endMonth: '2026-03',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        source: 'manual',
      }),
    ).toBe('2026-01 – 2026-03')
  })

  it('renders an empty label for a missing period', () => {
    expect(formatAccountingPeriodLabel(null)).toBe('')
  })
})


describe('accounting period provenance', () => {
  it('counts inclusive month spans without guessing invalid dates', () => {
    expect(accountingPeriodMonths('2025-12', '2026-02')).toBe(3)
    expect(accountingPeriodMonths('2026-01', '2026-01')).toBe(1)
    expect(accountingPeriodMonths('2026-05', '2026-01')).toBeNull()
    expect(accountingPeriodMonths('2026-13', '2026-01')).toBeNull()
  })

  it('detects source dates that extend outside a valid statement range', () => {
    expect(sourcePeriodOutside('2026-01', '2026-03', '2025-12', '2026-02')).toBe(true)
    expect(sourcePeriodOutside('2026-01', '2026-03', '2026-02', '2026-04')).toBe(true)
    expect(sourcePeriodOutside('2026-01', '2026-03', '2026-01', '2026-03')).toBe(false)
    expect(sourcePeriodOutside('2026-01', '2026-03', 'invalid', '2026-03')).toBe(false)
  })
})
