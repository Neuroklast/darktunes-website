import { describe, expect, it } from 'vitest'
import {
  GUIDED_WIZARD_STEP_IDS,
  canAdvanceGuidedStep,
  canNavigateToGuidedStep,
  deriveSuggestedGuidedStep,
  guidedContinueBlockedReason,
  guidedStepIndex,
} from './guidedWizard'

describe('guidedWizard', () => {
  it('suggests upload when no data or still processing', () => {
    expect(deriveSuggestedGuidedStep({ hasData: false, isProcessing: false })).toBe('upload')
    expect(deriveSuggestedGuidedStep({ hasData: true, isProcessing: true })).toBe('upload')
  })

  it('suggests review when data is ready', () => {
    expect(deriveSuggestedGuidedStep({ hasData: true, isProcessing: false })).toBe('review')
  })

  it('gates advance from upload until processing completes', () => {
    expect(canAdvanceGuidedStep('upload', { hasData: false, isProcessing: false })).toBe(false)
    expect(canAdvanceGuidedStep('upload', { hasData: true, isProcessing: true })).toBe(false)
    expect(canAdvanceGuidedStep('upload', { hasData: true, isProcessing: false })).toBe(true)
  })

  it('gates upload advance on exchange rates', () => {
    expect(
      canAdvanceGuidedStep('upload', {
        hasData: true,
        isProcessing: false,
        ratesReady: false,
      }),
    ).toBe(false)
    expect(
      canAdvanceGuidedStep('upload', {
        hasData: true,
        isProcessing: false,
        ratesReady: true,
      }),
    ).toBe(true)
  })

  it('blocks validate advance when blocking validation issues exist', () => {
    expect(
      canAdvanceGuidedStep('validate', {
        hasData: true,
        isProcessing: false,
        hasBlockingValidation: true,
      }),
    ).toBe(false)
    expect(
      canAdvanceGuidedStep('validate', {
        hasData: true,
        isProcessing: false,
        hasBlockingValidation: false,
      }),
    ).toBe(true)
  })

  it('orders the billing flow upload → validate → review → settle', () => {
    expect(guidedStepIndex('upload', GUIDED_WIZARD_STEP_IDS)).toBe(0)
    expect(guidedStepIndex('validate', GUIDED_WIZARD_STEP_IDS)).toBe(1)
    expect(guidedStepIndex('review', GUIDED_WIZARD_STEP_IDS)).toBe(2)
    expect(guidedStepIndex('settle', GUIDED_WIZARD_STEP_IDS)).toBe(3)
  })

  it('gates stepper navigation by data readiness and blocking checks', () => {
    const idle = { hasData: false, isProcessing: false }
    const processing = { hasData: true, isProcessing: true }
    const ready = { hasData: true, isProcessing: false }
    const blocked = { hasData: true, isProcessing: false, hasBlockingValidation: true }

    expect(canNavigateToGuidedStep('upload', idle)).toBe(true)
    expect(canNavigateToGuidedStep('validate', idle)).toBe(false)
    expect(canNavigateToGuidedStep('review', idle)).toBe(false)
    expect(canNavigateToGuidedStep('settle', idle)).toBe(false)

    expect(canNavigateToGuidedStep('validate', processing)).toBe(false)
    expect(canNavigateToGuidedStep('review', processing)).toBe(false)

    expect(canNavigateToGuidedStep('review', blocked)).toBe(false)
    expect(canNavigateToGuidedStep('settle', blocked)).toBe(false)

    expect(canNavigateToGuidedStep('validate', ready)).toBe(true)
    expect(canNavigateToGuidedStep('review', ready)).toBe(true)
    expect(canNavigateToGuidedStep('settle', ready)).toBe(true)

    // The rates gate applies to direct navigation too.
    expect(canNavigateToGuidedStep('review', { ...ready, ratesReady: false })).toBe(false)
  })

  it('returns plain-language blocked reasons', () => {
    expect(
      guidedContinueBlockedReason('upload', {
        hasData: false,
        isProcessing: false,
        ratesReady: true,
      }),
    ).toMatch(/upload/i)

    expect(
      guidedContinueBlockedReason('upload', {
        hasData: true,
        isProcessing: false,
        ratesReady: false,
      }),
    ).toMatch(/exchange rates/i)

    expect(
      guidedContinueBlockedReason('validate', {
        hasData: true,
        isProcessing: false,
        hasBlockingValidation: true,
      }),
    ).toMatch(/blocking/i)

    expect(
      guidedContinueBlockedReason('review', {
        hasData: true,
        isProcessing: false,
      }),
    ).toBeNull()
  })
  it('opens existing settlements with a period and no current CSV, without bypassing active validation errors', () => {
    const viewing = { hasData: false, isProcessing: false, canOpenExistingSettlements: true }
    expect(canNavigateToGuidedStep('settle', viewing)).toBe(true)
    expect(canNavigateToGuidedStep('review', viewing)).toBe(false)
    expect(canAdvanceGuidedStep('upload', viewing)).toBe(false)
    expect(canNavigateToGuidedStep('settle', { ...viewing, isProcessing: true })).toBe(false)
    expect(canNavigateToGuidedStep('settle', {
      ...viewing, hasData: true, hasBlockingValidation: true,
    })).toBe(false)
  })

})
