import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportingPanel } from './ReportingPanel'
import type { ArtistRevenue } from '@/lib/sos/types'

vi.mock('next-intl', () => ({
  useMessages: () => ({
    admin: {
      accounting: {
        reportingSettlementAlertTitle: 'Use Settlement Center for portal publishing',
        reportingSettlementAlertBody: 'Review payouts here, then open Settlement Center.',
        reportingSettlementCta: 'Open Settlement Center',
      },
    },
  }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}))

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

function makeRevenue(artist: string): ArtistRevenue {
  return {
    artist,
    believeRevenue: 0,
    bandcampRevenue: 0,
    darkmerchRevenue: 0,
    manualRevenue: 0,
    totalRevenue: 100,
    splitPercentage: 50,
    finalAmount: 50,
    totalQuantity: 0,
    totalExpenses: 0,
    distributionFeeDeducted: 0,
    totalStreamRevenue: 0,
    totalDownloadRevenue: 0,
    platformBreakdown: [],
    countryBreakdown: [],
    monthlyBreakdown: [],
    releaseBreakdown: [],
    physicalReleasesRevenue: 0,
    digitalSplitPercentage: 50,
    physicalSplitPercentage: 50,
    darkmerchSplitPercentage: 50,
  }
}

describe('ReportingPanel settlement center CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the settlement center banner when callback is provided', () => {
    const onGoToSettlementCenter = vi.fn()

    render(
      <ReportingPanel
        revenues={[makeRevenue('Artist A')]}
        onDownloadPDF={vi.fn()}
        onDownloadExcel={vi.fn()}
        onDownloadAll={vi.fn()}
        onDownloadSelected={vi.fn()}
        onGoToSettlementCenter={onGoToSettlementCenter}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Open Settlement Center/i }))
    expect(onGoToSettlementCenter).toHaveBeenCalledTimes(1)
  })

  it('does not render publish buttons anymore', () => {
    render(
      <ReportingPanel
        revenues={[makeRevenue('Artist A')]}
        onDownloadPDF={vi.fn()}
        onDownloadExcel={vi.fn()}
        onDownloadAll={vi.fn()}
        onDownloadSelected={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Publish Selected/i })).not.toBeInTheDocument()
  })

  it('shows period payout separately from opening and amount due', () => {
    render(
      <ReportingPanel
        revenues={[{
          ...makeRevenue('Artist A'),
          openingBalanceEur: 10,
          amountDueEur: 60,
        }]}
        onDownloadPDF={vi.fn()}
        onDownloadExcel={vi.fn()}
        onDownloadAll={vi.fn()}
        onDownloadSelected={vi.fn()}
      />,
    )

    expect(screen.getByText('Period payout')).toBeInTheDocument()
    expect(screen.getByText('Opening')).toBeInTheDocument()
    expect(screen.getByText('Amount due')).toBeInTheDocument()
  })
})