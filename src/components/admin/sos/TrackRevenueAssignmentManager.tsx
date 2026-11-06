'use client'

/**
 * src/components/admin/sos/TrackRevenueAssignmentManager.tsx
 *
 * UI for creating and managing TrackRevenueAssignment rules.
 * Each rule matches a full track or release title and redistributes
 * the revenue among one or more co-owner artists (sum must equal 100%).
 */

import { useState, useCallback } from 'react'
import { Plus, Trash, MusicNote, Info, Check, Warning } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { TrackRevenueAssignment, RevenueOwner } from '@/lib/sos/types'
import { PercentField } from '@/components/admin/sos/fields/AccountingNumberFields'
import { parseOptionalPercent, parseRequiredPercent } from '@/lib/sos/accountingInputValidation'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { v4 as uuidv4 } from 'uuid'
import { AccountingListPagination, ACCOUNTING_PAGE_SIZE } from './AccountingListPagination'

interface TrackRevenueAssignmentManagerProps {
  assignments: TrackRevenueAssignment[]
  onAddAssignment: (a: TrackRevenueAssignment) => void
  onRemoveAssignment: (id: string) => void
  availableArtists?: string[]
}

interface OwnerDraft {
  artist: string
  percentage: string
}

const EMPTY_DRAFT: OwnerDraft = { artist: '', percentage: '' }

function OwnerRow({
  owner,
  onChange,
  onRemove,
  artists,
  artistPlaceholder,
  percentLabel,
  removeLabel,
}: {
  owner: OwnerDraft
  onChange: (o: OwnerDraft) => void
  onRemove: () => void
  artists: string[]
  artistPlaceholder: string
  percentLabel: string
  removeLabel: string
}) {
  const pctParsed = parseOptionalPercent(owner.percentage)
  const pctValue = pctParsed.ok ? pctParsed.value : undefined

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <Input
          list="track-artists"
          value={owner.artist}
          onChange={e => onChange({ ...owner, artist: e.target.value })}
          placeholder={artistPlaceholder}
          className="h-8 text-sm"
          aria-label={artistPlaceholder}
        />
        <datalist id="track-artists">
          {artists.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>
      <PercentField
        label={percentLabel}
        value={pctValue}
        onChange={(v) => onChange({ ...owner, percentage: v == null ? '' : String(v) })}
        optional
        className="w-28 shrink-0"
        inputClassName="h-8 text-sm"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive mb-0.5"
        aria-label={removeLabel}
      >
        <Trash size={14} />
      </Button>
    </div>
  )
}

export function TrackRevenueAssignmentManager({
  assignments,
  onAddAssignment,
  onRemoveAssignment,
  availableArtists = [],
}: TrackRevenueAssignmentManagerProps) {
  const t = useAccountingLabels()
  const [trackTitle, setTrackTitle] = useState('')
  const [owners, setOwners] = useState<OwnerDraft[]>([EMPTY_DRAFT])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const filteredAssignments = assignments.filter(assignment => {
    const query = search.trim().toLocaleLowerCase()
    return !query || assignment.trackTitle.toLocaleLowerCase().includes(query) ||
      (assignment.owners ?? []).some(owner => owner.artist.toLocaleLowerCase().includes(query))
  })
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredAssignments.length / ACCOUNTING_PAGE_SIZE) - 1))
  const pagedAssignments = filteredAssignments.slice(currentPage * ACCOUNTING_PAGE_SIZE, (currentPage + 1) * ACCOUNTING_PAGE_SIZE)

  const ownerSum = owners.reduce((s, o) => {
    const parsed = parseOptionalPercent(o.percentage)
    return s + (parsed.ok && parsed.value != null ? parsed.value : 0)
  }, 0)
  const sumOk = Math.abs(ownerSum - 100) < 0.01

  const handleAddOwner = useCallback(() => {
    setOwners(prev => [...prev, { artist: '', percentage: '' }])
  }, [])

  const handleChangeOwner = useCallback((idx: number, o: OwnerDraft) => {
    setOwners(prev => prev.map((item, i) => i === idx ? o : item))
  }, [])

  const handleRemoveOwner = useCallback((idx: number) => {
    setOwners(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handleAdd = useCallback(() => {
    const title = trackTitle.trim()
    if (!title) {
      setError(t.trackTitleRequired)
      return
    }
    if (owners.length === 0 || owners.every(o => !o.artist.trim())) {
      setError(t.trackOwnerRequired)
      return
    }
    const parsed: RevenueOwner[] = []
    for (const o of owners.filter((o) => o.artist.trim())) {
      const pct = parseRequiredPercent(o.percentage)
      if (!pct.ok) {
        setError(t.validationPercentRange)
        return
      }
      parsed.push({ artist: o.artist.trim(), percentage: pct.value })
    }
    const sum = parsed.reduce((s, o) => s + o.percentage, 0)
    if (Math.abs(sum - 100) >= 0.01) {
      setError(`${t.validationPercentRange} (${sum.toFixed(1)}%)`)
      return
    }
    onAddAssignment({ id: uuidv4(), trackTitle: title, owners: parsed })
    setTrackTitle('')
    setOwners([EMPTY_DRAFT])
    setError('')
  }, [trackTitle, owners, onAddAssignment, t])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <MusicNote size={20} weight="bold" className="text-primary" />
        <h3 className="font-semibold">Track Revenue Assignments</h3>
      </div>

      <Card className="shrink-0 border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex gap-2">
          <Info size={16} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Assign all revenue from a track or release to specific artists with custom splits.
            Matching is the full title, ignoring case and extra spaces. A short title does not match a longer one.
            Owner percentages must sum to exactly 100%.
          </p>
        </div>
      </Card>

      {/* The creation form stays available but does not consume the entire list view. */}
      <details className="shrink-0 rounded-lg border border-border bg-card/30 open:max-h-[45%] open:overflow-y-auto" data-lenis-prevent>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {t.uiTrackAddRule}
        </summary>
      <Card className="m-3 space-y-4 border-border p-4">
        <h4 className="text-sm font-semibold">Add Assignment Rule</h4>

        <div className="space-y-2">
          <Label htmlFor="track-title-input">Track / Release title (full title)</Label>
          <Input
            id="track-title-input"
            value={trackTitle}
            onChange={e => { setTrackTitle(e.target.value); setError('') }}
            placeholder="e.g. Collab Track or Full Album Name"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Owners</Label>
            <span className={`text-xs font-medium ${sumOk ? 'text-green-600' : 'text-destructive'}`}>
              {ownerSum.toFixed(1)}% / 100%
            </span>
          </div>
          <div className="space-y-2">
            {owners.map((owner, idx) => (
              <OwnerRow
                key={idx}
                owner={owner}
                onChange={o => handleChangeOwner(idx, o)}
                onRemove={() => handleRemoveOwner(idx)}
                artists={availableArtists}
                artistPlaceholder={t.artistNamePlaceholder}
                percentLabel={t.trackPercentLabel}
                removeLabel={t.trackRemoveOwner}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddOwner}
            className="gap-1 h-7 text-xs"
          >
            <Plus size={12} /> Add Owner
          </Button>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <Warning size={13} /> {error}
          </p>
        )}

        <Button
          onClick={handleAdd}
          disabled={!trackTitle.trim() || !sumOk}
          className="gap-1.5"
        >
          <Plus size={15} weight="bold" /> Add Assignment
        </Button>
      </Card>
      </details>

      {/* Existing assignments */}
      {assignments.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Active Assignments ({assignments.length})</h4>
            <Input value={search}
              onChange={event => { setSearch(event.target.value); setPage(0) }}
              className="h-10 w-full max-w-sm text-sm" placeholder={t.uiTrackSearch}
              aria-label={t.uiTrackSearch} />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain" data-lenis-prevent>
          {pagedAssignments.map(a => {
            const ownerList = a.owners && a.owners.length > 0
              ? a.owners
              : a.ownerArtist ? [{ artist: a.ownerArtist, percentage: 100 }] : []
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <MusicNote size={14} className="text-primary flex-shrink-0" />
                      <p className="text-sm font-medium truncate">{a.trackTitle}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ownerList.map(o => (
                        <Badge key={o.artist} variant="secondary" className="text-xs gap-1">
                          <Check size={10} className="text-green-500" />
                          {o.artist} — {o.percentage}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemoveAssignment(a.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <Trash size={15} />
                  </Button>
                </div>
              </Card>
            )
          })}
          {filteredAssignments.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{t.uiTrackNoMatches}</p>
          )}
          </div>
          <AccountingListPagination count={filteredAssignments.length} page={currentPage} onPageChange={setPage} />
        </div>
      )}

      {assignments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MusicNote size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No track revenue assignments yet.</p>
          <p className="text-xs mt-1">Add rules above to redistribute revenue for collaborations.</p>
        </div>
      )}
    </div>
  )
}
