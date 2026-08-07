'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MailboxSortMode } from '@/lib/messaging/threads'

export type MailboxSortLabels = Record<MailboxSortMode, string>

export interface MailboxSortSelectProps {
  value: MailboxSortMode
  onChange: (value: MailboxSortMode) => void
  'aria-label'?: string
  className?: string
  /** Localized option labels (defaults English) */
  labels?: Partial<MailboxSortLabels>
  placeholder?: string
}

const DEFAULT_LABELS: MailboxSortLabels = {
  date_desc: 'Newest first',
  date_asc: 'Oldest first',
  unread_first: 'Unread first',
  subject_asc: 'Subject A–Z',
  count_desc: 'Most replies',
}

const OPTION_ORDER: MailboxSortMode[] = [
  'date_desc',
  'date_asc',
  'unread_first',
  'subject_asc',
  'count_desc',
]

export function MailboxSortSelect({
  value,
  onChange,
  'aria-label': ariaLabel = 'Sort conversations',
  className,
  labels,
  placeholder = 'Sort',
}: MailboxSortSelectProps) {
  const merged = { ...DEFAULT_LABELS, ...labels }
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MailboxSortMode)}>
      <SelectTrigger className={className ?? 'h-8 text-xs w-full'} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {OPTION_ORDER.map((mode) => (
          <SelectItem key={mode} value={mode} className="text-xs">
            {merged[mode]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
