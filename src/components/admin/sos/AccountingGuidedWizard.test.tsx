import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountingGuidedWizard } from './AccountingGuidedWizard'

vi.mock('@phosphor-icons/react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  ArrowRight: () => <span data-testid="icon-arrow-right" />,
  UploadSimple: () => <span data-testid="icon-upload" />,
  ChartBar: () => <span data-testid="icon-chart" />,
  SealCheck: () => <span data-testid="icon-seal" />,
  ShieldCheck: () => <span data-testid="icon-shield" />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  AlertDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props}>{children}</p>
  ),
}))

vi.mock('@/lib/i18n/accountingFallbacks', () => ({
  useAccountingLabels: () => ({}),
}))

describe('AccountingGuidedWizard navigation', () => {
  const onActiveStepChange = vi.fn()

  beforeEach(() => {
    onActiveStepChange.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  function renderWizard(
    overrides: Partial<React.ComponentProps<typeof AccountingGuidedWizard>> = {},
  ) {
    return render(
      <AccountingGuidedWizard
        hasData={false}
        isProcessing={false}
        activeStep="upload"
        onActiveStepChange={onActiveStepChange}
        uploadPanel={<div>upload-panel</div>}
        validatePanel={<div>validate-panel</div>}
        reviewPanel={<div>review-panel</div>}
        settlePanel={<div>settle-panel</div>}
        {...overrides}
      />,
    )
  }

  it('shows upload panel and disables continue without data', () => {
    renderWizard()

    expect(screen.getByText('upload-panel')).toBeInTheDocument()
    expect(screen.queryByText('review-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getAllByText(/Upload at least one sales file/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the checks panel as step 2 of 4', () => {
    renderWizard({ hasData: true, activeStep: 'validate' })

    expect(screen.getByText('validate-panel')).toBeInTheDocument()
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument()
  })

  it('uses Continue to statements on the review step', () => {
    renderWizard({ hasData: true, activeStep: 'review' })

    expect(screen.getByText('review-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to statements' })).toBeEnabled()
  })

  it('advances to settle when continue is clicked on review', () => {
    renderWizard({ hasData: true, activeStep: 'review' })

    fireEvent.click(screen.getByRole('button', { name: 'Continue to statements' }))
    expect(onActiveStepChange).toHaveBeenCalledWith('settle')
  })

  it('blocks continue when blocking checks exist', () => {
    renderWizard({ hasData: true, activeStep: 'validate', hasBlockingValidation: true })

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByText(/Fix the blocking errors/i)).toBeInTheDocument()
  })

  it('jumps to settle when the settle stepper control is clicked', () => {
    renderWizard({ hasData: true, activeStep: 'review' })

    fireEvent.click(screen.getByRole('button', { name: 'Create drafts, approve, and pay' }))
    expect(onActiveStepChange).toHaveBeenCalledWith('settle')
  })

  it('shows step progress in the footer', () => {
    renderWizard({ hasData: true, activeStep: 'review' })
    expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument()
  })

  it('notifies import ready without auto-advancing from upload', () => {
    const onImportReady = vi.fn()
    const { rerender } = renderWizard({ hasData: false, activeStep: 'upload', onImportReady })

    rerender(
      <AccountingGuidedWizard
        hasData
        isProcessing={false}
        activeStep="upload"
        onActiveStepChange={onActiveStepChange}
        onImportReady={onImportReady}
        uploadPanel={<div>upload-panel</div>}
        validatePanel={<div>validate-panel</div>}
        reviewPanel={<div>review-panel</div>}
        settlePanel={<div>settle-panel</div>}
      />,
    )

    expect(onImportReady).toHaveBeenCalledTimes(1)
    expect(onActiveStepChange).not.toHaveBeenCalledWith('review')
  })
  it('allows opening existing settlement statements with a valid period and no CSV session', () => {
    renderWizard({ canOpenExistingSettlements: true })
    fireEvent.click(screen.getByRole('button', { name: 'Create drafts, approve, and pay' }))
    expect(onActiveStepChange).toHaveBeenCalledWith('settle')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

})
