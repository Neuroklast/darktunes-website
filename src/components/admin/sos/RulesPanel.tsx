'use client'

/**
 * src/components/admin/sos/RulesPanel.tsx
 *
 * Combines all SOS rule managers into a single tabbed panel.
 * Embedded inside AccountingPanel as the "Rules" sub-tab.
 */

import { useEffect, useState } from 'react'
import type {
  ArtistMapping, CompilationFilter, SplitFee,
  ManualRevenue, ExpenseEntry, IgnoredEntry,
  CSVColumnAlias, AppDefaults, EmailConfig,
  TrackRevenueAssignment, LabelInfo,
} from '@/lib/sos/types'
import { ArtistMappingManager } from './ArtistMappingManager'
import { CompilationFilterManager } from './CompilationFilterManager'
import { SplitFeeManager } from './SplitFeeManager'
import { ManualRevenueManager } from './ManualRevenueManager'
import { ExpenseManager } from './ExpenseManager'
import { IgnoredEntriesManager } from './IgnoredEntriesManager'
import { CsvAliasManager } from './CsvAliasManager'
import { DefaultSettingsManager } from './DefaultSettingsManager'
import { EmailConfigManager } from './EmailConfigManager'
import { TrackRevenueAssignmentManager } from './TrackRevenueAssignmentManager'
import { LabelIdentityManager } from './LabelIdentityManager'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'

export type RulesTab =
  | 'label'
  | 'mappings'
  | 'compilations'
  | 'splits'
  | 'revenues'
  | 'expenses'
  | 'ignored'
  | 'track-splits'
  | 'aliases'
  | 'defaults'
  | 'email'

export interface RulesPanelProps {
  activeRuleTab?: RulesTab
  onRuleTabChange?: (tab: RulesTab) => void
  // State (passed in from parent so rules persist across sub-tab changes)
  artistMappings: ArtistMapping[]
  compilationFilters: CompilationFilter[]
  splitFees: SplitFee[]
  manualRevenues: ManualRevenue[]
  expenses: ExpenseEntry[]
  ignoredEntries: IgnoredEntry[]
  csvAliases: CSVColumnAlias[]
  trackRevenueAssignments: TrackRevenueAssignment[]
  appDefaults: AppDefaults
  emailConfig: Partial<EmailConfig>
  labelInfo: LabelInfo | Partial<LabelInfo>
  onUpdateLabelInfo: (next: LabelInfo) => void

  // Callbacks
  onAddArtistMapping: (m: Omit<ArtistMapping, 'id'>) => void
  onRemoveArtistMapping: (id: string) => void
  onUpdateArtistMapping?: (id: string, m: Omit<ArtistMapping, 'id'>) => void

  onAddCompilationFilter: (f: Omit<CompilationFilter, 'id'>) => void
  onRemoveCompilationFilter: (id: string) => void
  onUpdateCompilationFilter?: (id: string, update: Omit<CompilationFilter, 'id'>) => void

  onAddSplitFee: (fee: SplitFee) => void
  onRemoveSplitFee: (artist: string) => void
  onUpdateSplitFee?: (artist: string, update: Omit<SplitFee, 'artist'>) => void

  onAddManualRevenue: (r: Omit<ManualRevenue, 'id'>) => void
  onRemoveManualRevenue: (id: string) => void
  onUpdateManualRevenue?: (id: string, r: Omit<ManualRevenue, 'id'>) => void

  onAddExpense: (e: Omit<ExpenseEntry, 'id'>) => void
  onRemoveExpense: (id: string) => void
  onUpdateExpense?: (id: string, e: Omit<ExpenseEntry, 'id'>) => void

  onAddIgnoredEntry: (e: Omit<IgnoredEntry, 'id' | 'createdAt'>) => void
  onRemoveIgnoredEntry: (id: string) => void

  onAddCsvAlias: (alias: Omit<CSVColumnAlias, 'id'>) => void
  onRemoveCsvAlias: (id: string) => void

  onAddTrackAssignment: (a: TrackRevenueAssignment) => void
  onRemoveTrackAssignment: (id: string) => void

  onUpdateAppDefaults: (next: AppDefaults) => void
  onUpdateEmailConfig: (next: Partial<EmailConfig>) => void

  // Context data from useCSVProcessor
  availableArtists?: string[]
  availableReleases?: string[]
  autoMappings?: ArtistMapping[]
}

export function RulesPanel({
  activeRuleTab, onRuleTabChange,
  artistMappings, compilationFilters, splitFees, manualRevenues, expenses,
  ignoredEntries, csvAliases, trackRevenueAssignments, appDefaults, emailConfig,
  labelInfo, onUpdateLabelInfo,
  onAddArtistMapping, onRemoveArtistMapping, onUpdateArtistMapping,
  onAddCompilationFilter, onRemoveCompilationFilter, onUpdateCompilationFilter,
  onAddSplitFee, onRemoveSplitFee, onUpdateSplitFee,
  onAddManualRevenue, onRemoveManualRevenue, onUpdateManualRevenue,
  onAddExpense, onRemoveExpense, onUpdateExpense,
  onAddIgnoredEntry, onRemoveIgnoredEntry,
  onAddCsvAlias, onRemoveCsvAlias,
  onAddTrackAssignment, onRemoveTrackAssignment,
  onUpdateAppDefaults,
  onUpdateEmailConfig,
  availableArtists = [],
  availableReleases = [],
  autoMappings = [],
}: RulesPanelProps) {
  const t = useAccountingLabels()
  const [internalTab, setInternalTab] = useState<RulesTab>('label')
  const [lastGroupTab, setLastGroupTab] = useState<Partial<Record<string, RulesTab>>>({})
  const activeTab = activeRuleTab ?? internalTab
  const setActiveTab = (tab: RulesTab) => {
    setInternalTab(tab)
    onRuleTabChange?.(tab)
  }

  const tabs: { id: RulesTab; label: string }[] = [
    { id: 'label', label: t.rulesTabLabel },
    { id: 'email', label: t.uiRuleEmail },
    { id: 'mappings', label: t.uiRuleMappings },
    { id: 'splits', label: t.uiRuleSplits },
    { id: 'track-splits', label: t.uiRuleTrackSplits },
    { id: 'revenues', label: t.uiRuleRevenue },
    { id: 'expenses', label: t.uiRuleExpenses },
    { id: 'compilations', label: t.uiRuleCompilations },
    { id: 'ignored', label: t.uiRuleIgnored },
    { id: 'aliases', label: t.uiRuleColumns },
    { id: 'defaults', label: t.uiRuleDefaults },
  ]

  const groups: { id: string; label: string; tabIds: RulesTab[] }[] = [
    { id: 'identity', label: t.ruleGroupIdentity, tabIds: ['label', 'email'] },
    { id: 'royalties', label: t.ruleGroupPayouts, tabIds: ['mappings', 'splits', 'track-splits', 'revenues', 'expenses'] },
    { id: 'data', label: t.ruleGroupImports, tabIds: ['compilations', 'ignored', 'aliases'] },
    { id: 'defaults', label: t.ruleGroupDefaults, tabIds: ['defaults'] },
  ]
  const activeGroup = groups.find(group => group.tabIds.includes(activeTab)) ?? groups[0]
  useEffect(() => {
    setLastGroupTab(previous => previous[activeGroup.id] === activeTab ? previous : { ...previous, [activeGroup.id]: activeTab })
  }, [activeTab, activeGroup.id])

  const counts: Partial<Record<RulesTab, number>> = {
    mappings:     artistMappings.length + autoMappings.length,
    compilations: compilationFilters.length,
    splits:       splitFees.length,
    revenues:     manualRevenues.length,
    expenses:     expenses.length,
    ignored:      ignoredEntries.length,
    'track-splits': trackRevenueAssignments.length,
    aliases:      csvAliases.length,
  }

  return (
    <div className="space-y-0">
      <div className="border-b border-border bg-card/30 px-4 py-3 sm:px-6">
        <nav aria-label={t.ruleGroupNavigation} className="flex flex-wrap gap-2">
          {groups.map(group => {
            const selected = activeGroup.id === group.id
            const count = group.tabIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0)
            return (
              <button
                key={group.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => setActiveTab(lastGroupTab[group.id] ?? group.tabIds[0])}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'}`}
              >
                {group.label}
                {count > 0 && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{count}</span>}
              </button>
            )
          })}
        </nav>
      </div>
      <div className="border-b border-border px-4 py-2 sm:px-6">
        <nav aria-label={t.ruleCategoryNavigation} className="flex flex-wrap gap-2">
          {tabs.filter(tab => activeGroup.tabIds.includes(tab.id)).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => setActiveTab(id)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${activeTab === id ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {label}
              {(counts[id] ?? 0) > 0 && <span className="text-xs tabular-nums text-muted-foreground">{counts[id]}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        {activeTab === 'label' && (
          <LabelIdentityManager
            labelInfo={labelInfo}
            onUpdate={onUpdateLabelInfo}
            embedded
          />
        )}
        {activeTab === 'mappings' && (
          <ArtistMappingManager
            mappings={artistMappings}
            onAddMapping={onAddArtistMapping}
            onRemoveMapping={onRemoveArtistMapping}
            onUpdateMapping={onUpdateArtistMapping}
            artists={availableArtists}
            autoMappings={autoMappings}
          />
        )}
        {activeTab === 'compilations' && (
          <CompilationFilterManager
            filters={compilationFilters}
            onAddFilter={onAddCompilationFilter}
            onRemoveFilter={onRemoveCompilationFilter}
            onUpdateFilter={onUpdateCompilationFilter}
            availableReleases={availableReleases}
          />
        )}
        {activeTab === 'splits' && (
          <SplitFeeManager
            splitFees={splitFees}
            onAddSplitFee={onAddSplitFee}
            onRemoveSplitFee={onRemoveSplitFee}
            onUpdateSplitFee={onUpdateSplitFee}
            artists={availableArtists}
          />
        )}
        {activeTab === 'track-splits' && (
          <TrackRevenueAssignmentManager
            assignments={trackRevenueAssignments}
            onAddAssignment={onAddTrackAssignment}
            onRemoveAssignment={onRemoveTrackAssignment}
            availableArtists={availableArtists}
          />
        )}
        {activeTab === 'revenues' && (
          <ManualRevenueManager
            revenues={manualRevenues}
            onAddRevenue={onAddManualRevenue}
            onRemoveRevenue={onRemoveManualRevenue}
            onUpdateRevenue={onUpdateManualRevenue}
            artists={availableArtists}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpenseManager
            expenses={expenses}
            onAddExpense={onAddExpense}
            onRemoveExpense={onRemoveExpense}
            onUpdateExpense={onUpdateExpense}
            artists={availableArtists}
          />
        )}
        {activeTab === 'ignored' && (
          <IgnoredEntriesManager
            entries={ignoredEntries}
            onAddEntry={onAddIgnoredEntry}
            onRemoveEntry={onRemoveIgnoredEntry}
            artists={availableArtists}
            releaseTitles={availableReleases}
          />
        )}
        {activeTab === 'aliases' && (
          <CsvAliasManager
            aliases={csvAliases}
            onAddAlias={onAddCsvAlias}
            onRemoveAlias={onRemoveCsvAlias}
          />
        )}
        {activeTab === 'defaults' && (
          <DefaultSettingsManager
            defaults={appDefaults}
            onUpdate={onUpdateAppDefaults}
          />
        )}
        {activeTab === 'email' && (
          <EmailConfigManager
            config={emailConfig}
            onUpdate={onUpdateEmailConfig}
          />
        )}
      </div>
    </div>
  )
}
