'use client'

import { SettlementActionToolbar } from '@/components/admin/sos/SettlementActionToolbar'
import { SettlementCenterDialogs } from '@/components/admin/sos/SettlementCenterDialogs'
import { SettlementRegisterTable } from '@/components/admin/sos/SettlementRegisterTable'
import { SettlementWorkflowOverview } from '@/components/admin/sos/SettlementWorkflowOverview'
import type { SettlementCenterPanelProps } from '@/components/admin/sos/settlementCenterModel'
import { useSettlementCenter } from '@/hooks/useSettlementCenter'

export type { SettlementCenterPanelProps } from '@/components/admin/sos/settlementCenterModel'

export function SettlementCenterPanel({
  persistDisabled = false,
  territoryMetrics = [],
  merchOrderRows = [],
  bronzeBatchIds = [],
  ...hookProps
}: SettlementCenterPanelProps) {
  const settlement = useSettlementCenter({
    ...hookProps,
    territoryMetrics,
    merchOrderRows,
    bronzeBatchIds,
  })

  const reconciliation = settlement.balanceReconciliation

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      {reconciliation && !reconciliation.ok && (
        <p role="alert" className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {settlement.t.settlementReconciliationTitle}
          {' · '}
          {settlement.t.settlementReconciliationBody
            .replace('{computed}', reconciliation.computedOpenBalanceEur.toFixed(2))
            .replace('{reported}', reconciliation.reportedOpenBalanceEur.toFixed(2))
            .replace('{delta}', reconciliation.deltaEur.toFixed(2))}
        </p>
      )}
      <details className="shrink-0 rounded-lg border border-border bg-card/30">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {settlement.t.uiSettlementOverview}
          {' · '}{settlement.periodLabel}
          {settlement.period && (
            <span className="ml-2 text-muted-foreground">
              {settlement.periodStatusLabels[settlement.period.status] ?? settlement.period.status}
            </span>
          )}
        </summary>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto overscroll-contain border-t border-border p-4" data-lenis-prevent>
          <SettlementWorkflowOverview settlement={settlement} persistDisabled={persistDisabled} />
        </div>
      </details>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card/40">
        <SettlementActionToolbar settlement={settlement} />
        <SettlementRegisterTable settlement={settlement} />
      </div>
      <SettlementCenterDialogs settlement={settlement} />
    </div>
  )
}