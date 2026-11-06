'use client'

/**
 * src/components/admin/sos/CompilationFilterManager.tsx
 *
 * Manages compilation exclusion filters.
 * Adapted from the standalone SOS generator — i18n removed, imports adjusted.
 */

import { Plus, Trash, FunnelSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCallback, useMemo, useState } from 'react'
import type { CompilationFilter } from '@/lib/sos/types'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { SosConfirmDialog } from './SosConfirmDialog'

export interface CompilationFilterManagerProps {
  filters: CompilationFilter[]
  onAddFilter: (filter: Omit<CompilationFilter, 'id'>) => void
  onRemoveFilter: (id: string) => void
  onUpdateFilter?: (id: string, filter: Omit<CompilationFilter, 'id'>) => void
  availableReleases?: string[]
}

type FilterType = 'ean' | 'title' | 'catalog'

const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  ean: 'EAN / UPC',
  title: 'Release Title',
  catalog: 'Catalog Number',
}

function isDuplicate(filters: CompilationFilter[], identifier: string, type: FilterType, exceptId?: string) {
  return filters.some(f => f.id !== exceptId && f.type === type && f.identifier.trim().toLowerCase() === identifier.trim().toLowerCase())
}

export function CompilationFilterManager({
  filters,
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
  availableReleases = [],
}: CompilationFilterManagerProps) {
  const t = useAccountingLabels()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CompilationFilter | null>(null)
  const [type, setType] = useState<FilterType>('ean')
  const [identifier, setIdentifier] = useState('')
  const [releaseSearch, setReleaseSearch] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const duplicateValue = isDuplicate(filters, identifier, type, editId ?? undefined)
  const visibleFilters = useMemo(() => {
    const query = filterSearch.toLocaleLowerCase().trim()
    return query ? filters.filter(f => `${f.label} ${f.identifier} ${FILTER_TYPE_LABELS[f.type]}`.toLocaleLowerCase().includes(query)) : filters
  }, [filters, filterSearch])

  const handleClose = useCallback(() => {
    setOpen(false)
    setEditId(null)
    setType('ean')
    setIdentifier('')
    setReleaseSearch('')
  }, [])

  const handleAddManual = useCallback(() => {
    const trimmed = identifier.trim()
    if (!trimmed || isDuplicate(filters, trimmed, type, editId ?? undefined)) return
    if (editId && onUpdateFilter) onUpdateFilter(editId, { identifier: trimmed, type, label: trimmed })
    else if (!editId) onAddFilter({ identifier: trimmed, type, label: trimmed })
    handleClose()
  }, [identifier, type, filters, editId, onAddFilter, onUpdateFilter, handleClose])

  const handleAddFromRelease = useCallback((releaseTitle: string) => {
    if (isDuplicate(filters, releaseTitle, 'title', editId ?? undefined)) return
    const value = { identifier: releaseTitle, type: 'title' as const, label: releaseTitle }
    if (editId && onUpdateFilter) onUpdateFilter(editId, value)
    else if (!editId) onAddFilter(value)
    handleClose()
  }, [filters, editId, onAddFilter, onUpdateFilter, handleClose])

  const filteredReleases = useMemo(() => {
    const q = releaseSearch.toLowerCase()
    return q ? availableReleases.filter(r => r.toLowerCase().includes(q)) : availableReleases
  }, [availableReleases, releaseSearch])

  const startEdit = (filter: CompilationFilter) => {
    setEditId(filter.id)
    setIdentifier(filter.identifier)
    setType(filter.type)
    setOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FunnelSimple size={20} weight="bold" className="text-primary" />
          <h3 className="font-semibold">Compilation Filters</h3>
          {filters.length > 0 && <Badge variant="secondary">{filters.length}</Badge>}
        </div>

        <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus size={16} weight="bold" />
              {t.uiAddCompilation}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? t.uiEditCompilation : t.uiAddCompilation}</DialogTitle>
              <DialogDescription>{t.uiCompilationExplanation}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="filter-type">Identifier Type</Label>
                <Select value={type} onValueChange={v => setType(v as FilterType)}>
                  <SelectTrigger id="filter-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(FILTER_TYPE_LABELS) as [FilterType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-value">{FILTER_TYPE_LABELS[type]}</Label>
                <Input
                  id="filter-value"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder={`Enter ${FILTER_TYPE_LABELS[type].toLowerCase()}`}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                  autoFocus
                />
              </div>
              {availableReleases.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Or pick from detected releases</Label>
                  <div className="relative">
                    <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={releaseSearch}
                      onChange={e => setReleaseSearch(e.target.value)}
                      placeholder="Search releases…"
                      className="pl-8"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto overscroll-contain space-y-0.5 pr-1 border rounded-md p-1" data-lenis-prevent>
                    {filteredReleases.slice(0, 20).map(title => (
                      <button
                        key={title}
                        type="button"
                        disabled={isDuplicate(filters, title, 'title', editId ?? undefined)}
                        onClick={() => handleAddFromRelease(title)}
                        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between"
                      >
                        <span className="truncate">{title}</span>
                        {isDuplicate(filters, title, 'title', editId ?? undefined) && <Badge variant="outline" className="text-[10px] shrink-0">Added</Badge>}
                      </button>
                    ))}
                    {filteredReleases.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No releases found</p>}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleAddManual} disabled={!identifier.trim() || duplicateValue}>{editId ? t.uiSaveCompilation : t.uiAddCompilation}</Button>
            </DialogFooter>
            {duplicateValue && <p role="alert" className="text-xs text-amber-300">{t.uiDuplicateCompilation}</p>}
          </DialogContent>
        </Dialog>
      </div>

      {filters.length > 0 && (
        <div className="relative max-w-md">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filterSearch}
            onChange={event => setFilterSearch(event.target.value)}
            className="h-10 pl-9 text-sm"
            placeholder={t.uiSearchCompilations}
            aria-label={t.uiSearchCompilations}
          />
        </div>
      )}

      {visibleFilters.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card/30">
          {visibleFilters.map(filter => (
            <div key={filter.id} className="flex min-h-14 items-center gap-3 border-b border-border/70 px-3 py-2 last:border-b-0 sm:px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={filter.label}>{filter.label}</p>
                <p className="text-xs text-muted-foreground">{FILTER_TYPE_LABELS[filter.type]}</p>
              </div>
              {onUpdateFilter && (
                <Button type="button" variant="outline" size="sm" className="h-9 px-3 text-xs"
                  onClick={() => startEdit(filter)} aria-label={`${t.uiEditCompilation}: ${filter.label}`}>
                  {t.uiEditCompilation}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`${t.uiRemoveCompilation}: ${filter.label}`}
                title={t.uiRemoveCompilation}
                onClick={() => setDeleteTarget(filter)}
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash size={17} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Card className="rounded-lg border-dashed p-8 text-center">
          <FunnelSimple size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filters.length ? t.uiNoMatchingCompilations : 'No compilation filters yet.'}
          </p>
        </Card>
      )}
      {filters.length > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {t.uiFiltersShown.replace('{shown}', String(visibleFilters.length)).replace('{total}', String(filters.length))}
        </p>
      )}
      <SosConfirmDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title={t.uiRemoveCompilation}
        description={t.uiCompilationDeleteConfirm.replace('{name}', deleteTarget?.label ?? '')}
        confirmLabel={t.uiRemoveCompilation} cancelLabel={t.uiCancel} destructive
        onConfirm={() => { if (deleteTarget) onRemoveFilter(deleteTarget.id); setDeleteTarget(null) }}
      />
    </div>
  )
}
