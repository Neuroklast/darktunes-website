'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getAdminAccessToken } from '@/lib/admin/getAccessToken'
import type { SettlementRegister } from '@/lib/api/settlementRegister'
import {
  archiveSettlementPeriod,
  bulkApproveStatements,
  createStatementCorrection,
  deleteSalesStatement,
  fetchSettlementRegister,
  lockSettlementPeriod,
  markInvoiceReceived,
  recordInvoicePayment,
} from '@/lib/api/settlementCenterApi'
import {
  reconcileRegisterOpenBalance,
  type RegisterReconciliationResult,
} from '@/lib/api/settlementReconciliation'
import { runPersistSosAnalytics } from '@/lib/sos/runPersistSosAnalytics'
import type { LabelArtist } from '@/lib/sos/types'
import { monthToPeriodDate } from '@/lib/sos/lineItemsFromArtistData'
import {
  countByWorkflowStatus,
  deriveActiveWorkflowStep,
  deriveCompletedWorkflowSteps,
  workflowStatusFromStatement,
} from '@/lib/sos/statementWorkflow'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import {
  buildInvoiceStatusLabels,
  buildPeriodStatusLabels,
  computeNextPeriod,
  registerToMasterRow,
  rowIsSelectable,
  type MasterRow,
  type PaymentMethod,
  type SettlementCenterPanelProps,
} from '@/components/admin/sos/settlementCenterModel'
import { normalizeArtistNameKey } from '@/lib/sos/artistNameKey'

export type SettlementCenterState = ReturnType<typeof useSettlementCenter>

export function useSettlementCenter({
  revenues,
  labelArtists,
  periodStart,
  periodEnd,
  territoryMetrics = [],
  merchOrderRows = [],
  bronzeBatchIds = [],
  onCreateDraft,
  onBuildCorrectionPdf,
}: SettlementCenterPanelProps) {
  const t = useAccountingLabels()
  const invoiceStatusLabels = useMemo(() => buildInvoiceStatusLabels(t), [t])
  const periodStatusLabels = useMemo(() => buildPeriodStatusLabels(t), [t])

  const [register, setRegister] = useState<SettlementRegister | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set())
  const [approvalNotes, setApprovalNotes] = useState('')
  const [creatingDrafts, setCreatingDrafts] = useState(false)
  const [approving, setApproving] = useState(false)
  const [markingReceived, setMarkingReceived] = useState(false)
  const [locking, setLocking] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [busyArtists, setBusyArtists] = useState<Set<string>>(new Set())
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [paymentAmountsEur, setPaymentAmountsEur] = useState<Record<string, string>>({})
  const [paymentIdempotencyKeys, setPaymentIdempotencyKeys] = useState<Record<string, string>>({})
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('sepa')
  const [paymentReference, setPaymentReference] = useState('')
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false)
  const [correctionTarget, setCorrectionTarget] = useState<MasterRow | null>(null)
  const [correctionAmountEur, setCorrectionAmountEur] = useState('')
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [deletingDraft, setDeletingDraft] = useState(false)
  const [syncAnalyticsOnApprove, setSyncAnalyticsOnApprove] = useState(true)

  const canPersistAnalytics = territoryMetrics.length > 0

  const persistPortalAnalytics = useCallback(async (): Promise<boolean> => {
    if (!canPersistAnalytics) return false

    const result = await runPersistSosAnalytics({
      periodStart,
      periodEnd,
      territoryMetrics,
      merchOrderRows,
      labelArtists,
      revenues,
      bronzeBatchIds,
    })

    if (!result.success) {
      toast.error(result.error ?? t.analyticsPersistFailed)
      return false
    }

    return true
  }, [
    bronzeBatchIds,
    canPersistAnalytics,
    labelArtists,
    merchOrderRows,
    periodEnd,
    periodStart,
    revenues,
    territoryMetrics,
    t.analyticsPersistFailed,
  ])

  const periodStartDate = monthToPeriodDate(periodStart, false)
  const periodEndDate = monthToPeriodDate(periodEnd || periodStart, true)
  const periodLabel =
    periodStart && periodEnd && periodEnd !== periodStart
      ? `${periodStart} – ${periodEnd}`
      : periodStart || periodEnd || t.settlementCurrentPeriod

  const defaultNextPeriod = useMemo(() => {
    if (!periodStartDate || !periodEndDate) return { start: '', end: '' }
    return computeNextPeriod(periodStartDate, periodEndDate)
  }, [periodStartDate, periodEndDate])

  const [nextPeriodStart, setNextPeriodStart] = useState(defaultNextPeriod.start)
  const [nextPeriodEnd, setNextPeriodEnd] = useState(defaultNextPeriod.end)

  useEffect(() => {
    setNextPeriodStart(defaultNextPeriod.start)
    setNextPeriodEnd(defaultNextPeriod.end)
  }, [defaultNextPeriod.start, defaultNextPeriod.end])

  const artistMap = useMemo(() => {
    const map = new Map<string, LabelArtist>()
    for (const artist of labelArtists) {
      map.set(normalizeArtistNameKey(artist.name), artist)
    }
    return map
  }, [labelArtists])

  const refreshRegister = useCallback(async () => {
    if (!periodStartDate || !periodEndDate) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      const registerData = await fetchSettlementRegister(
        token,
        periodStartDate,
        periodEndDate,
        t.settlementRegisterLoadFailed,
      )
      setRegister(registerData)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementRegisterLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [periodStartDate, periodEndDate, t.settlementRegisterLoadFailed, t.settlementSessionExpired])

  useEffect(() => {
    void refreshRegister()
  }, [refreshRegister])

  const rows = useMemo<MasterRow[]>(() => {
    const registerRows = register?.rows ?? []
    const registerByArtistId = new Map(registerRows.map((row) => [row.artistId, row]))
    const registerByName = new Map(
      registerRows.map((row) => [normalizeArtistNameKey(row.artistName ?? ''), row]),
    )
    const seenArtistIds = new Set<string>()
    const seenNames = new Set<string>()
    const masterRows: MasterRow[] = []

    for (const revenue of revenues) {
      const roster = artistMap.get(normalizeArtistNameKey(revenue.artist))
      const artistId = roster?.artistId?.trim() || null
      const reg =
        (artistId ? registerByArtistId.get(artistId) : undefined) ??
        registerByName.get(normalizeArtistNameKey(revenue.artist))

      if (reg) {
        masterRows.push({
          ...registerToMasterRow(reg),
          payout: revenue.finalAmount,
        })
        seenArtistIds.add(reg.artistId)
        seenNames.add(normalizeArtistNameKey(revenue.artist))
      } else {
        masterRows.push({
          artistName: roster?.name ?? revenue.artist,
          artistId,
          workflowStatus: workflowStatusFromStatement(undefined, !!artistId),
          paidAmountCents: 0,
          ledgerBalanceEur: 0,
          payout: revenue.finalAmount,
        })
        seenNames.add(normalizeArtistNameKey(revenue.artist))
      }
    }

    for (const reg of registerRows) {
      if (!seenArtistIds.has(reg.artistId) && !seenNames.has(normalizeArtistNameKey(reg.artistName ?? ''))) {
        masterRows.push(registerToMasterRow(reg))
      }
    }

    return masterRows.sort((a, b) =>
      (a.artistName || '').localeCompare(b.artistName || '', 'de'),
    )
  }, [register, revenues, artistMap])

  const filteredRows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => (row.artistName || '').toLowerCase().includes(query))
  }, [rows, filter])

  const counts = useMemo(() => countByWorkflowStatus(rows), [rows])
  const kpis = useMemo(
    () =>
      register?.kpis ?? {
        approved: 0,
        viewed: 0,
        invoiced: 0,
        received: 0,
        paid: 0,
        openBalanceEur: 0,
      },
    [register?.kpis],
  )

  const balanceReconciliation = useMemo<RegisterReconciliationResult | null>(() => {
    if (!register) return null
    return reconcileRegisterOpenBalance(
      register.rows.map((row) => ({
        artistId: row.artistId,
        ledgerBalanceEur: row.ledgerBalanceEur,
      })),
      register.kpis.openBalanceEur,
    )
  }, [register])

  const period = register?.period
  const periodWritable = period ? !['locked', 'archived'].includes(period.status) : true

  const workflowProgress = useMemo(
    () => ({
      rowCount: rows.length,
      counts,
      kpis,
    }),
    [rows.length, counts, kpis],
  )

  const activeStep = useMemo(
    () => deriveActiveWorkflowStep(workflowProgress),
    [workflowProgress],
  )

  const completedSteps = useMemo(
    () => deriveCompletedWorkflowSteps(workflowProgress),
    [workflowProgress],
  )

  const selectableRows = filteredRows.filter(rowIsSelectable)
  const allSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedArtists.has(row.artistName))

  const selectedDraftTargets = rows.filter(
    (row) => selectedArtists.has(row.artistName) && row.workflowStatus === 'not_uploaded' && row.artistId && row.payout != null,
  )
  const selectedApproveTargets = rows.filter(
    (row) => selectedArtists.has(row.artistName) && row.workflowStatus === 'draft' && row.statementId,
  )
  const selectedReceivedTargets = rows.filter(
    (row) =>
      selectedArtists.has(row.artistName) &&
      row.invoiceId &&
      !row.receivedAt &&
      row.invoiceStatus === 'sent',
  )
  const selectedPaymentTargets = rows.filter(
    (row) =>
      selectedArtists.has(row.artistName) &&
      row.invoiceId &&
      row.invoiceStatus !== 'paid' &&
      row.invoiceStatus !== 'cancelled',
  )

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedArtists(new Set())
      return
    }
    setSelectedArtists(new Set(selectableRows.map((row) => row.artistName)))
  }

  const toggleArtist = (artistName: string) => {
    setSelectedArtists((current) => {
      const next = new Set(current)
      if (next.has(artistName)) next.delete(artistName)
      else next.add(artistName)
      return next
    })
  }

  const runDeleteDraft = async (statementId: string, artistName: string) => {
    setDeletingDraft(true)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      await deleteSalesStatement(
        token,
        statementId,
        interpolate(t.settlementDeleteDraftFailed, { artist: artistName }),
      )
      await refreshRegister()
      toast.success(interpolate(t.settlementDeleteDraftSuccess, { artist: artistName }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementDeleteDraftFailed)
    } finally {
      setDeletingDraft(false)
    }
  }

  const runDraftCreation = async (targets: MasterRow[]) => {
    if (targets.length === 0) return
    setCreatingDrafts(true)
    let created = 0

    for (const target of targets) {
      setBusyArtists((current) => new Set(current).add(target.artistName))
      try {
        await onCreateDraft(target.artistName)
        created += 1
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : interpolate(t.settlementDeleteDraftFailed, { artist: target.artistName }),
        )
      } finally {
        setBusyArtists((current) => {
          const next = new Set(current)
          next.delete(target.artistName)
          return next
        })
      }
    }

    await refreshRegister()
    setCreatingDrafts(false)
    toast.success(interpolate(t.settlementDraftsCreated, { count: created }))
  }

  const runApproval = async (statementIds: string[]) => {
    if (statementIds.length === 0) return
    setApproving(true)

    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      const json = await bulkApproveStatements(
        token,
        statementIds,
        approvalNotes.trim() || undefined,
        t.settlementBulkApproveFailed,
      )

      await refreshRegister()
      setSelectedArtists(new Set())
      const emailed = json.emailed ?? 0
      toast.success(
        interpolate(t.settlementApprovedToast, { approved: json.approved ?? 0 }) +
          (emailed > 0 ? interpolate(t.settlementNotificationsSent, { emailed }) : ''),
      )

      if (syncAnalyticsOnApprove) {
        const synced = await persistPortalAnalytics()
        if (synced) {
          toast.success(t.settlementAnalyticsSyncedOnApprove)
        } else if (!canPersistAnalytics) {
          toast.message(t.settlementAnalyticsSyncSkipped)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementApproveFailed)
    } finally {
      setApproving(false)
    }
  }

  const runMarkReceived = async (targets: MasterRow[]) => {
    if (targets.length === 0) return
    setMarkingReceived(true)

    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      let updated = 0
      for (const target of targets) {
        if (!target.invoiceId) continue
        await markInvoiceReceived(
          token,
          target.invoiceId,
          interpolate(t.settlementInvoiceMarkFailedFor, { artist: target.artistName }),
        )
        updated += 1
      }

      await refreshRegister()
      setSelectedArtists(new Set())
      toast.success(interpolate(t.settlementInvoicesMarkedReceived, { count: updated }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementMarkReceivedFailed)
    } finally {
      setMarkingReceived(false)
    }
  }

  const defaultOutstandingEur = (target: MasterRow): string => {
    const cents =
      target.outstandingAmountCents ??
      (target.payout != null ? Math.round(target.payout * 100) : undefined)
    return cents != null ? (cents / 100).toFixed(2) : ''
  }

  const openPaymentDialog = () => {
    if (selectedPaymentTargets.length === 0) return
    const amounts: Record<string, string> = {}
    const idempotencyKeys: Record<string, string> = {}
    for (const target of selectedPaymentTargets) {
      if (target.invoiceId) {
        amounts[target.invoiceId] = defaultOutstandingEur(target)
        idempotencyKeys[target.invoiceId] = crypto.randomUUID()
      }
    }
    setPaymentAmountsEur(amounts)
    setPaymentIdempotencyKeys(idempotencyKeys)
    setPaymentMethod('sepa')
    setPaymentReference('')
    setPaymentDialogOpen(true)
  }

  const runRecordPayment = async () => {
    setRecordingPayment(true)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      let recorded = 0
      for (const target of selectedPaymentTargets) {
        if (!target.invoiceId) continue
        const eurRaw = paymentAmountsEur[target.invoiceId] ?? ''
        const amountEur = Number.parseFloat(eurRaw.replace(',', '.'))
        if (!Number.isFinite(amountEur) || amountEur <= 0) {
          throw new Error(interpolate(t.settlementInvalidAmountFor, { artist: target.artistName }))
        }
        const amountCents = Math.round(amountEur * 100)
        const maxCents =
          target.outstandingAmountCents ??
          (target.payout != null ? Math.round(target.payout * 100) : undefined)
        if (maxCents != null && amountCents > maxCents) {
          throw new Error(
            interpolate(t.settlementAmountExceedsFor, {
              artist: target.artistName,
              amount: (maxCents / 100).toFixed(2),
            }),
          )
        }

        const idempotencyKey =
          paymentIdempotencyKeys[target.invoiceId] ?? crypto.randomUUID()
        await recordInvoicePayment(
          token,
          target.invoiceId,
          {
            amountCents,
            paymentMethod,
            paymentReference: paymentReference.trim() || undefined,
            idempotencyKey,
          },
          interpolate(t.settlementPaymentFailedFor, { artist: target.artistName }),
        )
        recorded += 1
      }

      await refreshRegister()
      setSelectedArtists(new Set())
      setPaymentDialogOpen(false)
      toast.success(interpolate(t.settlementPaymentsRecorded, { count: recorded }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementRecordPaymentFailed)
    } finally {
      setRecordingPayment(false)
    }
  }

  const runLockPeriod = async () => {
    if (!period?.id) return
    setLocking(true)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      await lockSettlementPeriod(token, period.id, t.settlementLockFailed)

      await refreshRegister()
      setLockDialogOpen(false)
      toast.success(t.settlementPeriodLockedToast)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementLockFailedToast)
    } finally {
      setLocking(false)
    }
  }

  const openCorrectionDialog = (row: MasterRow) => {
    const defaultAmount = row.statementAmountEur ?? row.payout
    setCorrectionTarget(row)
    setCorrectionAmountEur(defaultAmount != null ? String(defaultAmount) : '')
    setCorrectionNotes('')
    setCorrectionDialogOpen(true)
  }

  const correctionDeltaEur = useMemo(() => {
    if (!correctionTarget) return null
    const next = Number.parseFloat(correctionAmountEur.replace(',', '.'))
    if (!Number.isFinite(next)) return null
    const previous = correctionTarget.statementAmountEur ?? correctionTarget.payout
    if (previous == null) return null
    return next - previous
  }, [correctionTarget, correctionAmountEur])

  const runCorrection = async () => {
    if (!correctionTarget?.statementId) return
    const amountEur = Number.parseFloat(correctionAmountEur.replace(',', '.'))
    if (!Number.isFinite(amountEur)) {
      toast.error(t.settlementCorrectionInvalidAmount)
      return
    }

    if (!onBuildCorrectionPdf) {
      toast.error(t.settlementCorrectionPdfUnavailable)
      return
    }

    setCorrecting(true)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      const pdfBase64 = await onBuildCorrectionPdf(correctionTarget.artistName, amountEur)
      if (!pdfBase64) {
        toast.error(t.settlementCorrectionPdfRequired)
        return
      }

      await createStatementCorrection(
        token,
        correctionTarget.statementId,
        {
          amountEur,
          pdfBase64,
          labelNotes: correctionNotes.trim() || undefined,
        },
        t.settlementCorrectionFailed,
      )

      await refreshRegister()
      setCorrectionDialogOpen(false)
      setCorrectionTarget(null)
      toast.success(
        interpolate(t.settlementCorrectionCreated, { artist: correctionTarget.artistName }),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementCorrectionFailedToast)
    } finally {
      setCorrecting(false)
    }
  }

  const runArchivePeriod = async () => {
    if (!period?.id || !nextPeriodStart || !nextPeriodEnd) return
    setArchiving(true)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.settlementSessionExpired)

      await archiveSettlementPeriod(
        token,
        period.id,
        nextPeriodStart,
        nextPeriodEnd,
        t.settlementArchiveFailed,
      )

      await refreshRegister()
      setArchiveDialogOpen(false)
      toast.success(t.settlementPeriodArchivedToast)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.settlementArchiveFailedToast)
    } finally {
      setArchiving(false)
    }
  }

  return {
    t,
    invoiceStatusLabels,
    periodStatusLabels,
    periodStart,
    periodEnd,
    territoryMetrics,
    merchOrderRows,
    labelArtists,
    revenues,
    bronzeBatchIds,
    periodLabel,
    period,
    periodWritable,
    kpis,
    balanceReconciliation,
    activeStep,
    completedSteps,
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
    runDraftCreation,
    runApproval,
    runMarkReceived,
    openPaymentDialog,
    setLockDialogOpen,
    setArchiveDialogOpen,
    filter,
    setFilter,
    loading,
    filteredRows,
    selectableRows,
    allSelected,
    selectedArtists,
    toggleSelectAll,
    toggleArtist,
    busyArtists,
    openCorrectionDialog,
    correctionDialogOpen,
    setCorrectionDialogOpen,
    correctionTarget,
    setCorrectionTarget,
    correctionAmountEur,
    setCorrectionAmountEur,
    correctionNotes,
    setCorrectionNotes,
    correcting,
    deletingDraft,
    runDeleteDraft,
    correctionDeltaEur,
    runCorrection,
    paymentDialogOpen,
    setPaymentDialogOpen,
    paymentAmountsEur,
    setPaymentAmountsEur,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    recordingPayment,
    runRecordPayment,
    defaultOutstandingEur,
    lockDialogOpen,
    runLockPeriod,
    archiveDialogOpen,
    nextPeriodStart,
    setNextPeriodStart,
    nextPeriodEnd,
    setNextPeriodEnd,
    runArchivePeriod,
  }
}