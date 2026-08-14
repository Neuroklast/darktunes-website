import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettlementCenterPanel } from './SettlementCenterPanel'
import type { SettlementPeriod } from '@/lib/api/settlementPeriods'
import { mergeAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import type { SettlementCenterState } from '@/hooks/useSettlementCenter'
import type { ArtistRevenue } from '@/lib/sos/types'
import type { StatementWorkflowStep } from '@/lib/sos/statementWorkflow'
import {
  buildInvoiceStatusLabels,
  buildPeriodStatusLabels,
} from '@/components/admin/sos/settlementCenterModel'

const t = mergeAccountingLabels()

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
    believeSplitPercentage: 50,
    bandcampSplitPercentage: 50,
    physicalSplitPercentage: 50,
    darkmerchSplitPercentage: 50,
  }
}

const mockPeriod: SettlementPeriod = {
  id: 'period-1',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  label: '2026-01',
  status: 'open',
  notes: undefined,
  lockedAt: undefined,
  lockedBy: undefined,
  archivedAt: undefined,
  archivedBy: undefined,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function makeMockSettlement(overrides?: Partial<SettlementCenterState>): SettlementCenterState {
  return {
    t,
    invoiceStatusLabels: buildInvoiceStatusLabels(t),
    periodStatusLabels: buildPeriodStatusLabels(t),
    periodStart: '2026-01',
    periodEnd: '2026-01',
    territoryMetrics: [],
    merchOrderRows: [],
    labelArtists: [],
    revenues: [makeRevenue('Artist A')],
    bronzeBatchIds: [],
    periodLabel: '2026-01',
    period: mockPeriod,
    periodWritable: true,
    kpis: {
      approved: 0,
      viewed: 0,
      invoiced: 0,
      received: 0,
      paid: 0,
      openBalanceEur: 0,
    },
    balanceReconciliation: null,
    activeStep: 'draft' as StatementWorkflowStep,
    completedSteps: new Set<StatementWorkflowStep>(),
    canPersistAnalytics: false,
    approvalNotes: '',
    setApprovalNotes: vi.fn(),
    syncAnalyticsOnApprove: true,
    setSyncAnalyticsOnApprove: vi.fn(),
    creatingDrafts: false,
    approving: false,
    markingReceived: false,
    locking: false,
    archiving: false,
    selectedDraftTargets: [],
    selectedApproveTargets: [],
    selectedReceivedTargets: [],
    selectedPaymentTargets: [],
    runDraftCreation: vi.fn(),
    runApproval: vi.fn(),
    runMarkReceived: vi.fn(),
    openPaymentDialog: vi.fn(),
    setLockDialogOpen: vi.fn(),
    setArchiveDialogOpen: vi.fn(),
    filter: '',
    setFilter: vi.fn(),
    loading: false,
    filteredRows: [
      {
        artistName: 'Artist A',
        artistId: 'artist-1',
        workflowStatus: 'not_uploaded',
        paidAmountCents: 0,
        ledgerBalanceEur: 0,
        payout: 50,
      },
    ],
    selectableRows: [
      {
        artistName: 'Artist A',
        artistId: 'artist-1',
        workflowStatus: 'not_uploaded',
        paidAmountCents: 0,
        ledgerBalanceEur: 0,
        payout: 50,
      },
    ],
    allSelected: false,
    selectedArtists: new Set<string>(),
    toggleSelectAll: vi.fn(),
    toggleArtist: vi.fn(),
    busyArtists: new Set<string>(),
    openCorrectionDialog: vi.fn(),
    correctionDialogOpen: false,
    setCorrectionDialogOpen: vi.fn(),
    correctionTarget: null,
    setCorrectionTarget: vi.fn(),
    correctionAmountEur: '',
    setCorrectionAmountEur: vi.fn(),
    correctionNotes: '',
    setCorrectionNotes: vi.fn(),
    correcting: false,
    deletingDraft: false,
    runDeleteDraft: vi.fn(),
    correctionDeltaEur: null,
    runCorrection: vi.fn(),
    paymentDialogOpen: false,
    setPaymentDialogOpen: vi.fn(),
    paymentAmountsEur: {},
    setPaymentAmountsEur: vi.fn(),
    paymentMethod: 'sepa',
    setPaymentMethod: vi.fn(),
    paymentReference: '',
    setPaymentReference: vi.fn(),
    recordingPayment: false,
    runRecordPayment: vi.fn(),
    defaultOutstandingEur: () => '50.00',
    lockDialogOpen: false,
    runLockPeriod: vi.fn(),
    archiveDialogOpen: false,
    nextPeriodStart: '2026-02-01',
    setNextPeriodStart: vi.fn(),
    nextPeriodEnd: '2026-02-28',
    setNextPeriodEnd: vi.fn(),
    runArchivePeriod: vi.fn(),
    ...overrides,
  }
}

const mockUseSettlementCenter = vi.fn(() => makeMockSettlement())

vi.mock('next-intl', () => ({
  useMessages: () => ({ admin: { accounting: {} } }),
}))

vi.mock('@/hooks/useSettlementCenter', () => ({
  useSettlementCenter: () => mockUseSettlementCenter(),
}))

vi.mock('@/components/admin/sos/SosAnalyticsPersistPanel', () => ({
  SosAnalyticsPersistPanel: () => <div data-testid="analytics-persist-panel" />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
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

describe('SettlementCenterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSettlementCenter.mockImplementation(() => makeMockSettlement())
  })

  it('renders the settlement heading and artist row', () => {
    render(
      <SettlementCenterPanel
        revenues={[makeRevenue('Artist A')]}
        labelArtists={[]}
        periodStart="2026-01"
        periodEnd="2026-01"
        onCreateDraft={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: t.settlementHeading })).toBeInTheDocument()
    expect(screen.getAllByText('Artist A').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(t.settlementFilterPlaceholder)).toBeInTheDocument()
  })

  it('opens the lock period dialog from the toolbar', () => {
    const setLockDialogOpen = vi.fn()
    mockUseSettlementCenter.mockImplementation(() =>
      makeMockSettlement({ setLockDialogOpen }),
    )

    render(
      <SettlementCenterPanel
        revenues={[makeRevenue('Artist A')]}
        labelArtists={[]}
        periodStart="2026-01"
        periodEnd="2026-01"
        onCreateDraft={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t.settlementLockPeriod }))
    expect(setLockDialogOpen).toHaveBeenCalledWith(true)
  })
})