export type GuidedWizardStep = 'upload' | 'validate' | 'review' | 'settle'

/**
 * One linear billing flow: files → checks → amounts → statements.
 * Settings (rules) and insights stay reachable outside the money path.
 */
export const GUIDED_WIZARD_STEP_IDS: readonly GuidedWizardStep[] = [
  'upload',
  'validate',
  'review',
  'settle',
] as const

export type GuidedStepGateInput = {
  hasData: boolean
  isProcessing: boolean
  hasBlockingValidation?: boolean
  /** Allow browsing existing settlement records when a valid period is selected but no CSV session is loaded. */
  canOpenExistingSettlements?: boolean
  /** When false, Upload cannot continue (exchange rates not loaded yet). */
  ratesReady?: boolean
}

export function deriveSuggestedGuidedStep(input: {
  hasData: boolean
  isProcessing: boolean
}): GuidedWizardStep {
  if (!input.hasData || input.isProcessing) return 'upload'
  return 'review'
}

export function guidedStepIndex(
  step: GuidedWizardStep,
  stepIds: readonly GuidedWizardStep[],
): number {
  return stepIds.indexOf(step)
}

export function canAdvanceGuidedStep(
  step: GuidedWizardStep,
  input: GuidedStepGateInput,
  _stepIds: readonly GuidedWizardStep[] = GUIDED_WIZARD_STEP_IDS,
): boolean {
  if (step === 'upload') {
    return input.hasData && !input.isProcessing && input.ratesReady !== false
  }
  if (step === 'validate') return input.hasData && !input.hasBlockingValidation
  if (step === 'review') return input.hasData
  return false
}

export function canNavigateToGuidedStep(
  target: GuidedWizardStep,
  input: GuidedStepGateInput,
  stepIds: readonly GuidedWizardStep[] = GUIDED_WIZARD_STEP_IDS,
): boolean {
  const targetIndex = guidedStepIndex(target, stepIds)
  if (targetIndex < 0) return false
  if (targetIndex === 0) return true
  // Existing settlements live in the database and are readable independently of
  // a current import. This does not bypass checks for an active CSV session.
  if (target === 'settle' && !input.hasData && !input.isProcessing && input.canOpenExistingSettlements) return true
  // Direct stepper navigation uses exactly the same gates as the Continue
  // button for every preceding step — there is no weaker navigation path.
  for (let index = 0; index < targetIndex; index++) {
    if (!canAdvanceGuidedStep(stepIds[index], input, stepIds)) return false
  }
  return true
}

export type GuidedBlockedReasonLabels = {
  blockedUploadNoData: string
  blockedUploadProcessing: string
  blockedUploadRates: string
  blockedValidateErrors: string
  blockedReviewNoData: string
}

const BLOCKED_REASON_FALLBACK: GuidedBlockedReasonLabels = {
  blockedUploadNoData: 'Upload at least one sales file and wait until numbers appear.',
  blockedUploadProcessing: 'Please wait — files are still being processed.',
  blockedUploadRates: 'Please wait — exchange rates are still loading.',
  blockedValidateErrors: 'Fix the blocking errors in the checklist before continuing.',
  blockedReviewNoData: 'Upload and process sales files before publishing.',
}

/**
 * Human-readable reason Continue is disabled, or null when advance is allowed.
 */
export function guidedContinueBlockedReason(
  step: GuidedWizardStep,
  input: GuidedStepGateInput,
  labels: Partial<GuidedBlockedReasonLabels> = {},
): string | null {
  const t = { ...BLOCKED_REASON_FALLBACK, ...labels }
  if (canAdvanceGuidedStep(step, input)) return null

  if (step === 'upload') {
    if (input.ratesReady === false) return t.blockedUploadRates
    if (input.isProcessing) return t.blockedUploadProcessing
    return t.blockedUploadNoData
  }
  if (step === 'validate') {
    if (!input.hasData) return t.blockedUploadNoData
    if (input.hasBlockingValidation) return t.blockedValidateErrors
    return t.blockedUploadNoData
  }
  if (step === 'review') return t.blockedReviewNoData
  return null
}
