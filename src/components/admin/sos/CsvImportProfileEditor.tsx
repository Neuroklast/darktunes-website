'use client'

import { useState } from 'react'
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
  onSave: (profile: CsvImportProfile) => void
  onDelete: (id: string) => void
}

export function CsvImportProfileEditor({
  profiles,
  customProfiles,
  onSave,
  onDelete,
}: CsvImportProfileEditorProps) {
  const t = useAccountingLabels()
  const [draft, setDraft] = useState<CsvImportProfile | null>(null)
  const [query, setQuery] = useState('')
  const matches = (profile: CsvImportProfile) => profile.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const systemProfiles = profiles.filter(profile => profile.isSystemDefault && matches(profile))
  const userProfiles = profiles.filter(profile => !profile.isSystemDefault && matches(profile))

  const startNew = () => {
    setDraft({
      id: uuidv4(),
      name: '',
      type: 'financial',
      delimiter: ',',
      autoDetectHeaders: [],
      columnMapping: {},
    })
  }

  const startEdit = (profile: CsvImportProfile) => {
    setDraft({ ...profile, columnMapping: { ...profile.columnMapping } })
  }

  const saveDraft = () => {
    if (!draft?.name.trim()) return
    const headers = draft.autoDetectHeaders.length > 0
      ? draft.autoDetectHeaders
      : Object.values(draft.columnMapping).filter((v): v is string => Boolean(v))
    onSave({ ...draft, autoDetectHeaders: headers })
    setDraft(null)
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
                    {profile.type} · {profile.autoDetectHeaders.length} detect headers
                  </p>
                </div>
                {!profile.isSystemDefault && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(profile)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(profile.id)}
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
                onValueChange={(v) => setDraft({ ...draft, delimiter: v as ',' | ';' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Comma (,)</SelectItem>
                  <SelectItem value=";">Semicolon (;)</SelectItem>
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
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveDraft}>
              <FloppyDisk size={14} className="mr-1" /> Save profile
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}