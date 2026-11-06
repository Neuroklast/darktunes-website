'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import type { SettlementCenterState } from '@/hooks/useSettlementCenter'
import { interpolate } from '@/lib/i18n/interpolate'
import {
  Archive,
  CircleNotch,
  CurrencyEur,
  FileArrowUp,
  Lock,
  PaperPlaneTilt,
  TrayArrowDown,
} from '@phosphor-icons/react'

interface SettlementActionToolbarProps {
  settlement: SettlementCenterState
}

export function SettlementActionToolbar({ settlement }: SettlementActionToolbarProps) {
  const {
    t,
    periodWritable,
    canPersistAnalytics,
    approvalNotes,
    setApprovalNotes,
    syncAnalyticsOnApprove,
    setSyncAnalyticsOnApprove,
    creatingDrafts,
    approving,
    markingReceived,
    locking,
    archiving,
    selectedDraftTargets,
    selectedApproveTargets,
    selectedReceivedTargets,
    selectedPaymentTargets,
    period,
    runDraftCreation,
    runApproval,
    runMarkReceived,
    openPaymentDialog,
    setLockDialogOpen,
    setArchiveDialogOpen,
  } = settlement

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3 sm:p-4">
      <details className="rounded-lg border border-border/70 bg-background/30">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {t.settlementApprovalNotesLabel}
        </summary>
        <div className="space-y-3 border-t border-border/70 p-3">
        <label htmlFor="settlement-approval-notes" className="text-xs font-medium text-muted-foreground">
          {t.settlementApprovalNotesLabel}
        </label>
        <Textarea
          id="settlement-approval-notes"
          value={approvalNotes}
          onChange={(event) => setApprovalNotes(event.target.value)}
          placeholder={t.settlementApprovalNotesPlaceholder}
          className="min-h-[72px] resize-y"
          disabled={!periodWritable}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={syncAnalyticsOnApprove}
            onCheckedChange={(checked) => setSyncAnalyticsOnApprove(checked === true)}
            disabled={!canPersistAnalytics || !periodWritable}
            aria-label={t.settlementSyncAnalyticsOnApprove}
          />
          <span>{t.settlementSyncAnalyticsOnApprove}</span>
        </label>
        </div>
      </details>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-start">
        <Button
          size="default"
          variant="secondary"
          className="gap-2 w-full sm:w-auto"
          disabled={!periodWritable || creatingDrafts || selectedDraftTargets.length === 0}
          onClick={() => void runDraftCreation(selectedDraftTargets)}
        >
          {creatingDrafts ? <CircleNotch size={18} className="animate-spin" /> : <FileArrowUp size={18} />}
          {interpolate(t.settlementCreateDrafts, { count: selectedDraftTargets.length })}
        </Button>
        <Button
          size="default"
          className="gap-2 w-full sm:w-auto"
          disabled={!periodWritable || approving || selectedApproveTargets.length === 0}
          onClick={() => void runApproval(selectedApproveTargets.map((row) => row.statementId!))}
        >
          {approving ? <CircleNotch size={18} className="animate-spin" /> : <PaperPlaneTilt size={18} />}
          {interpolate(t.settlementApproveNotify, { count: selectedApproveTargets.length })}
        </Button>
        <Button
          size="default"
          variant="outline"
          className="gap-2 w-full sm:w-auto"
          disabled={!periodWritable || markingReceived || selectedReceivedTargets.length === 0}
          onClick={() => void runMarkReceived(selectedReceivedTargets)}
        >
          {markingReceived ? (
            <CircleNotch size={18} className="animate-spin" />
          ) : (
            <TrayArrowDown size={18} />
          )}
          {interpolate(t.settlementMarkReceived, { count: selectedReceivedTargets.length })}
        </Button>
        <Button
          size="default"
          variant="outline"
          className="gap-2 w-full sm:w-auto"
          disabled={!periodWritable || selectedPaymentTargets.length === 0}
          onClick={openPaymentDialog}
        >
          <CurrencyEur size={18} />
          {interpolate(t.settlementRecordPayment, { count: selectedPaymentTargets.length })}
        </Button>
        <Button
          size="default"
          variant="outline"
          className="gap-2 w-full sm:w-auto"
          disabled={!periodWritable || locking || !period || period.status === 'locked' || period.status === 'archived'}
          onClick={() => setLockDialogOpen(true)}
        >
          {locking ? <CircleNotch size={18} className="animate-spin" /> : <Lock size={18} />}
          {t.settlementLockPeriod}
        </Button>
        <Button
          size="default"
          variant="outline"
          className="gap-2 w-full sm:w-auto col-span-2 sm:col-span-1"
          disabled={!periodWritable || archiving || !period || period.status === 'archived'}
          onClick={() => setArchiveDialogOpen(true)}
        >
          {archiving ? <CircleNotch size={18} className="animate-spin" /> : <Archive size={18} />}
          {t.settlementArchivePeriod}
        </Button>
      </div>
    </div>
  )
}