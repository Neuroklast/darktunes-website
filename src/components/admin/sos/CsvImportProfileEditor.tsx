'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { v4 as uuidv4 } from 'uuid'
import { FloppyDisk, Plus, Trash, Lock, MagnifyingGlass } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CsvImportProfile, FinancialFieldKey } from '@/lib/sos/ingest/types'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { SosConfirmDialog } from './SosConfirmDialog'
import { csvProfileDefinitionKey } from '@/lib/sos/ingest/csvProfileRegistry'
import { readImportSample } from '@/lib/sos/ingest/importSample'
import { matchProfile } from '@/lib/sos/ingest/parser-facade'

const FINANCIAL_FIELDS: FinancialFieldKey[] = [
  'salesMonth',
  'artistName',
  'netRevenue',
  'platform',
  'country',
  'quantity',
  'releaseTitle',
  'trackTitle',
  'currency',
  'releaseType',
  'catalogNumber',
  'upcEan',
  'isrc',
  'bandcampPackage',
]

interface CsvImportProfileEditorProps {
  profiles: CsvImportProfile[]
  customProfiles: CsvImportProfile[]
  shadowedProfiles?: CsvImportProfile[]
  nameConflicts?: string[]
  onSave: (profile: CsvImportProfile) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function CsvImportProfileEditor({
  profiles,
  customProfiles,
  shadowedProfiles = [],
  nameConflicts = [],
  onSave,
  onDelete,
}: CsvImportProfileEditorProps) {
  const t = useAccountingLabels()
  const ti = useTranslations('admin.accounting')
  const [draft, setDraft] = useState<CsvImportProfile | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CsvImportProfile | null>(null)
  const [testInfo, setTestInfo] = useState<{ name: string; recognized: boolean; columns: number; error?: string } | null>(null)
  const duplicateDraft = draft != null && profiles.some((profile) =>
    profile.id !== draft.id && csvProfileDefinitionKey(profile) === csvProfileDefinitionKey(draft))
  const testSample = async (file: File | undefined) => {
    if (!file || !draft) return
    try {
      const sample = await readImportSample(file)
      setTestInfo({
        name: file.name,
        recognized: matchProfile(sample.headers, [draft], sample.delimiter)?.id === draft.id,
        columns: sample.headers.length,
      })
    } catch (error) {
      setTestInfo({
        name: file.name, recognized: false, columns: 0,
        error: error instanceof Error ? error.message : t.uiProfileTestFailed,
      })
    }
  }
  const matches = (profile: CsvImportProfile) => profile.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const systemProfiles = profiles.filter(profile => profile.isSystemDefault && matches(profile))
  const userProfiles = profiles.filter(profile => !profile.isSystemDefault && matches(profile))

  const startNew = () => {
    setTestInfo(null)
    setDraft({
      id: uuidv4(),
      name: '',
      type: 'financial',
      delimiter: ',',
      autoDetectHeaders: [],
      parserSource: 'believe',
      dateSemantics: 'sale-date',
      dateOrder: 'day-first',
      amountConvention: 'auto',
      columnMapping: {},
    })
  }

  const startEdit = (profile: CsvImportProfile) => {
    setTestInfo(null)
    setSaveError('')
    setDraft({ ...profile, columnMapping: { ...profile.columnMapping } })
  }
  const removeProfile = async (id: string) => {
    setSaving(true)
    setSaveError('')
    try {
      await onDelete(id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Deleting the profile failed.')
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    if (!draft?.name.trim() || saving || duplicateDraft) return
    const headers = draft.autoDetectHeaders.length > 0
      ? draft.autoDetectHeaders
      : Object.values(draft.columnMapping).filter((v): v is string => Boolean(v))
    if (headers.length < 3) {
      setSaveError('Choose at least three identifying column headers before saving.')
      return
    }
    if (!draft.columnMapping.netRevenue || !draft.columnMapping.artistName ||
        (draft.dateSemantics !== 'none' && !draft.columnMapping.salesMonth)) {
      setSaveError('Map Artist, Net Revenue and Date (unless the source has no dates).')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await onSave({ ...draft, autoDetectHeaders: headers })
      setDraft(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Saving the profile failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          CSV profiles drive auto-detection in the unified upload zone.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={startNew}>
          <Plus size={14} className="mr-1" /> New profile
        </Button>
      </div>

      {shadowedProfiles.length > 0 && (
        <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <h3 className="text-sm font-semibold">{t.uiHiddenDuplicateProfiles.replace('{count}', String(shadowedProfiles.length))}</h3>
          <p className="text-xs text-muted-foreground">{t.uiHiddenDuplicateHint}</p>
          {shadowedProfiles.filter((profile) => !profile.isSystemDefault).map((profile) => (
            <div key={profile.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm">{profile.name}</span>
              <Button type="button" size="sm" variant="ghost" disabled={saving}
                aria-label={t.uiRemoveProfile + ': ' + profile.name}
                onClick={() => setDeleteTarget(profile)}><Trash size={16} aria-hidden="true" /></Button>
            </div>
          ))}
        </section>
      )}
      {nameConflicts.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-300">
          {t.uiProfileNameConflicts.replace('{names}', nameConflicts.join(', '))}
        </p>
      )}
      <div className="relative">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-10 pl-9 text-sm"
          placeholder={t.uiSearchProfiles}
          aria-label={t.uiSearchProfiles}
        />
      </div>
      {([
        { key: 'system', title: t.uiSystemProfiles, items: systemProfiles },
        { key: 'custom', title: t.uiCustomProfiles, items: userProfiles },
      ] as const).map(group => group.items.length > 0 && (
        <section key={group.key} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title} <span className="ml-1 tabular-nums">({group.items.length})</span>
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            {group.items.map(profile => (
              <div key={profile.id} className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/30 px-3 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {profile.isSystemDefault && <Lock size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="truncate" title={profile.name}>{profile.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.type} · {profile.parserSource ?? 'legacy'} · {profile.dateSemantics ?? 'unspecified date'} · v{profile.revision ?? 1}
                  </p>
                </div>
                {!profile.isSystemDefault && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(profile)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(profile)} disabled={saving}
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                      title={`Delete ${profile.name}`} aria-label={`Delete profile ${profile.name}`}>
                      <Trash size={16} aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {systemProfiles.length === 0 && userProfiles.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t.uiNoMatchingProfiles}
        </p>
      )}

      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      {draft && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card/50">
          <p className="text-sm font-medium">{customProfiles.some((p) => p.id === draft.id) ? 'Edit' : 'New'} CSV Profile</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Delimiter</Label>
              <Select
                value={draft.delimiter}
                onValueChange={(v) => setDraft({ ...draft, delimiter: v as ',' | ';' | '\t', headerFingerprint: undefined })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Comma (,)</SelectItem>
                  <SelectItem value=";">Semicolon (;)</SelectItem>
                  <SelectItem value="\t">Tab (TSV)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{ti('aiImportSource')}</Label>
              <Select value={draft.parserSource ?? 'believe'} onValueChange={(value) =>
                setDraft({ ...draft, parserSource: value as 'believe' | 'bandcamp' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="believe">{ti('aiImportStandardSource')}</SelectItem>
                  <SelectItem value="bandcamp">Bandcamp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{ti('aiImportDateSemantics')}</Label>
              <Select value={draft.dateSemantics ?? 'sale-date'} onValueChange={(value) =>
                setDraft({ ...draft, dateSemantics: value as 'sale-date' | 'report-period' | 'none' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale-date">{ti('aiImportSaleDate')}</SelectItem>
                  <SelectItem value="report-period">{ti('aiImportReportPeriod')}</SelectItem>
                  <SelectItem value="none">{ti('aiImportNoDate')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(draft.dateSemantics ?? 'sale-date') === 'sale-date' && <div className="space-y-1">
              <Label className="text-xs">{ti('aiImportDateFormat')}</Label>
              <Select value={draft.dateOrder ?? 'day-first'} onValueChange={(value) =>
                setDraft({ ...draft, dateOrder: value as 'day-first' | 'month-first' | 'iso' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day-first">DD/MM/YYYY</SelectItem>
                  <SelectItem value="month-first">MM/DD/YYYY</SelectItem>
                  <SelectItem value="iso">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>}
            <div className="space-y-1">
              <Label className="text-xs">{ti('aiImportDecimal')}</Label>
              <Select value={draft.amountConvention ?? 'auto'} onValueChange={(value) =>
                setDraft({ ...draft, amountConvention: value as 'de' | 'en' | 'auto' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{ti('aiImportAutoUnambiguous')}</SelectItem>
                  <SelectItem value="en">{ti('aiImportEnglishDecimal')}</SelectItem>
                  <SelectItem value="de">{ti('aiImportGermanDecimal')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Auto-detect headers (comma-separated)</Label>
            <Input
              value={draft.autoDetectHeaders.join(', ')}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  autoDetectHeaders: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  headerFingerprint: undefined,
                })
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {FINANCIAL_FIELDS.map((field) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs capitalize">{field}</Label>
                <Input
                  value={draft.columnMapping[field] ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      columnMapping: { ...draft.columnMapping, [field]: e.target.value },
                    })
                  }
                  placeholder="CSV column name"
                />
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label htmlFor="csv-profile-test" className="text-sm font-medium">{t.uiProfileTestLabel}</Label>
            <Input id="csv-profile-test" type="file" accept=".csv,.xlsx"
              className="h-auto py-2 text-sm"
              onChange={(event) => { void testSample(event.target.files?.[0]); event.target.value = '' }} />
            <p className="text-xs text-muted-foreground">{t.uiProfileTestHint}</p>
            {testInfo && (
              <p role="status" className={testInfo.recognized ? 'text-sm text-emerald-400' : 'text-sm text-amber-300'}>
                {testInfo.name}: {testInfo.error ?? t.uiProfileTestResult.replace('{count}', String(testInfo.columns))
                  .replace('{status}', testInfo.recognized ? t.uiProfileRecognized : t.uiProfileNotRecognized)}
              </p>
            )}
          </div>
          {duplicateDraft && <p role="alert" className="text-sm text-amber-300">{t.uiIdenticalProfile}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={saving || duplicateDraft} onClick={() => { void saveDraft() }}>
              <FloppyDisk size={14} className="mr-1" /> Save profile
            </Button>
          </div>
        </div>
      )}
      <SosConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !saving) setDeleteTarget(null) }}
        title={t.uiRemoveProfile}
        description={t.uiProfileDeleteConfirm.replace('{name}', deleteTarget?.name ?? '')}
        confirmLabel={t.uiRemoveProfile}
        cancelLabel={t.uiCancel}
        destructive
        onConfirm={() => {
          if (!deleteTarget || saving) return
          const id = deleteTarget.id
          void removeProfile(id).then(() => setDeleteTarget(null))
        }}
      />
    </div>
  )
}