'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  UploadSimple,
  ChartBar,
  SealCheck,
  ShieldCheck,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  GUIDED_WIZARD_STEP_IDS,
  canAdvanceGuidedStep,
  canNavigateToGuidedStep,
  guidedContinueBlockedReason,
  guidedStepIndex,
  type GuidedBlockedReasonLabels,
  type GuidedWizardStep,
} from '@/lib/sos/guidedWizard'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { cn } from '@/lib/utils'

const GUIDED_FALLBACK = {
  guidedStepUpload: 'Files',
  guidedStepUploadDesc: 'Import sales CSV files',
  guidedStepValidate: 'Checks',
  guidedStepValidateDesc: 'Automatic checks before payout review',
  guidedStepReview: 'Amounts',
  guidedStepReviewDesc: 'Check amounts before publishing',
  guidedStepSettle: 'Statements',
  guidedStepSettleDesc: 'Create drafts, approve, and pay',
  guidedBack: 'Back',
  guidedNext: 'Continue',
  guidedOpenSettle: 'Continue to statements',
  guidedProcessingHint: 'Processing CSV data…',
  guidedUploadHint: 'Upload at least one sales CSV to continue.',
  guidedReviewHint: 'Check artist payouts, then continue to statements.',
  guidedSettleHint: 'Create drafts, approve them, then record payments below.',
  guidedStepperAria: 'Accounting workflow',
  guidedStepOf: 'Step {current} of {total}',
  blockedUploadNoData: 'Upload at least one sales file and wait until numbers appear.',
  blockedUploadProcessing: 'Please wait — files are still being processed.',
  blockedUploadRates: 'Please wait — exchange rates are still loading.',
  blockedValidateErrors: 'Fix the blocking errors in the checklist before continuing.',
  blockedReviewNoData: 'Upload and process sales files before publishing.',
} as const

const STEP_META: Record<
  GuidedWizardStep,
  { icon: typeof UploadSimple; labelKey: keyof typeof GUIDED_FALLBACK; descKey: keyof typeof GUIDED_FALLBACK }
> = {
  upload: {
    icon: UploadSimple,
    labelKey: 'guidedStepUpload',
    descKey: 'guidedStepUploadDesc',
  },
  validate: {
    icon: ShieldCheck,
    labelKey: 'guidedStepValidate',
    descKey: 'guidedStepValidateDesc',
  },
  review: {
    icon: ChartBar,
    labelKey: 'guidedStepReview',
    descKey: 'guidedStepReviewDesc',
  },
  settle: {
    icon: SealCheck,
    labelKey: 'guidedStepSettle',
    descKey: 'guidedStepSettleDesc',
  },
}

export interface AccountingGuidedWizardProps {
  hasData: boolean
  isProcessing: boolean
  activeStep: GuidedWizardStep
  onActiveStepChange: (step: GuidedWizardStep) => void
  onImportReady?: () => void
  stepIds?: readonly GuidedWizardStep[]
  hasBlockingValidation?: boolean
  canOpenExistingSettlements?: boolean
  ratesReady?: boolean
  /** Extra content under the stepper (e.g. FX banner). */
  statusBanner?: React.ReactNode
  uploadPanel: React.ReactNode
  validatePanel?: React.ReactNode
  reviewPanel: React.ReactNode
  settlePanel: React.ReactNode
  labels?: Partial<Record<keyof typeof GUIDED_FALLBACK, string>>
}

/**
 * The single billing flow: Files → Checks → Amounts → Statements.
 * One primary action per step; blocked steps explain themselves.
 */
export function AccountingGuidedWizard({
  hasData,
  isProcessing,
  activeStep,
  onActiveStepChange,
  onImportReady,
  stepIds = GUIDED_WIZARD_STEP_IDS,
  hasBlockingValidation = false,
  canOpenExistingSettlements = false,
  ratesReady = true,
  statusBanner,
  uploadPanel,
  validatePanel,
  reviewPanel,
  settlePanel,
  labels,
}: AccountingGuidedWizardProps) {
  const accountingLabels = useAccountingLabels()
  const t = useMemo(
    () => ({ ...GUIDED_FALLBACK, ...accountingLabels, ...labels }),
    [accountingLabels, labels],
  )
  const settlePanelRef = useRef<HTMLDivElement>(null)
  const stepInput = useMemo(
    () => ({
      hasData,
      isProcessing,
      hasBlockingValidation,
      canOpenExistingSettlements,
      ratesReady,
    }),
    [hasData, isProcessing, hasBlockingValidation, canOpenExistingSettlements, ratesReady],
  )
  const importReadyNotifiedRef = useRef(false)

  useEffect(() => {
    if (!hasData) {
      importReadyNotifiedRef.current = false
      return
    }

    if (!isProcessing && activeStep === 'upload' && !importReadyNotifiedRef.current) {
      importReadyNotifiedRef.current = true
      onImportReady?.()
    }
  }, [activeStep, hasData, isProcessing, onImportReady])

  useEffect(() => {
    if (activeStep !== 'settle') return
    settlePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeStep])

  const blockedReasonLabels = useMemo((): GuidedBlockedReasonLabels => ({
    blockedUploadNoData: t.blockedUploadNoData,
    blockedUploadProcessing: t.blockedUploadProcessing,
    blockedUploadRates: t.blockedUploadRates,
    blockedValidateErrors: t.blockedValidateErrors,
    blockedReviewNoData: t.blockedReviewNoData,
  }), [t])

  const blockedReason = useMemo(
    () => guidedContinueBlockedReason(activeStep, stepInput, blockedReasonLabels),
    [activeStep, stepInput, blockedReasonLabels],
  )

  const stepHint = useMemo(() => {
    if (activeStep === 'upload') {
      return isProcessing ? t.guidedProcessingHint : t.guidedUploadHint
    }
    if (activeStep === 'validate') {
      return t.guidedStepValidateDesc
    }
    if (activeStep === 'review') return t.guidedReviewHint
    return t.guidedSettleHint
  }, [activeStep, isProcessing, t])

  const goBack = useCallback(() => {
    const index = guidedStepIndex(activeStep, stepIds)
    if (index > 0) {
      const prev = stepIds[index - 1]
      if (prev) onActiveStepChange(prev)
    }
  }, [activeStep, onActiveStepChange, stepIds])

  const goNext = useCallback(() => {
    const index = guidedStepIndex(activeStep, stepIds)
    const next = stepIds[index + 1]
    if (next) onActiveStepChange(next)
  }, [activeStep, onActiveStepChange, stepIds])

  const canGoNext = canAdvanceGuidedStep(activeStep, stepInput, stepIds)
  const canGoBack = guidedStepIndex(activeStep, stepIds) > 0
  const nextLabel = activeStep === 'review' ? t.guidedOpenSettle : t.guidedNext
  const stepNumber = guidedStepIndex(activeStep, stepIds) + 1
  const stepProgress = t.guidedStepOf
    .replace('{current}', String(stepNumber))
    .replace('{total}', String(stepIds.length))
  const activeStepLabel = t[STEP_META[activeStep].labelKey]

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-muted/10 px-4 py-3 sm:px-6">
        <nav aria-label={t.guidedStepperAria}>
          <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
            {stepIds.map((id, index) => {
              const meta = STEP_META[id]
              const Icon = meta.icon
              const isActive = activeStep === id
              const isComplete = guidedStepIndex(activeStep, stepIds) > index
              const canNavigate = canNavigateToGuidedStep(id, stepInput, stepIds)
              return (
                <li key={id} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canNavigate}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={t[meta.descKey]}
                    onClick={() => {
                      if (canNavigate) onActiveStepChange(id)
                    }}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      isActive
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : isComplete
                          ? 'border-border bg-background text-muted-foreground hover:text-foreground'
                          : 'border-border/60 text-muted-foreground',
                      canNavigate ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {t[meta.labelKey]}
                  </button>
                  {index < stepIds.length - 1 && (
                    <span className="hidden sm:inline text-muted-foreground" aria-hidden="true">
                      →
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      {statusBanner}

      <p className="mx-4 mt-3 rounded-md border border-border/70 bg-card/30 px-4 py-2 text-sm text-muted-foreground sm:mx-6" role="status">
        {stepHint}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
        {activeStep === 'upload' && uploadPanel}
        {activeStep === 'validate' && validatePanel}
        {activeStep === 'review' && reviewPanel}
        {activeStep === 'settle' && (
          <div ref={settlePanelRef} id="accounting-guided-settle-panel">
            {settlePanel}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-1 min-w-0">
          <Button type="button" variant="outline" disabled={!canGoBack} onClick={goBack} className="min-h-11 w-fit">
            <ArrowLeft size={16} className="mr-1.5" aria-hidden="true" />
            {t.guidedBack}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {stepProgress} · {activeStepLabel}
          </span>
        </div>
        {activeStep !== 'settle' ? (
          <div className="flex flex-col items-end gap-1 max-w-sm">
            <Button type="button" disabled={!canGoNext} onClick={goNext} className="min-h-11">
              {nextLabel}
              <ArrowRight size={16} className="ml-1.5" aria-hidden="true" />
            </Button>
            {!canGoNext && blockedReason && (
              <p className="text-[11px] text-muted-foreground text-right leading-snug" role="status">
                {blockedReason}
              </p>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t.guidedSettleHint}</span>
        )}
      </div>
    </div>
  )
}
