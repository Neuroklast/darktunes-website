'use client'

import { Check, CircleNotch, Minus, Warning } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { TOOL_LABELS } from '@/lib/ai/tools/labels'
import type { UiToolActivity } from '@/components/ai/types'

const TOOL_KEYS = {
  echo_test: 'tools.echo_test',
  get_artist_profile: 'tools.get_artist_profile',
  get_artist_releases: 'tools.get_artist_releases',
  get_release_submission_status: 'tools.get_release_submission_status',
  search_portal_help: 'tools.search_portal_help',
  get_artist_analytics: 'tools.get_artist_analytics',
  get_artist_statements: 'tools.get_artist_statements',
  get_artist_invoices: 'tools.get_artist_invoices',
  get_artist_events: 'tools.get_artist_events',
  get_artist_tour_overview: 'tools.get_artist_tour_overview',
  get_artist_documents_metadata: 'tools.get_artist_documents_metadata',
  get_portal_feature_availability: 'tools.get_portal_feature_availability',
  get_label_analytics: 'tools.get_label_analytics',
  get_artist_overview: 'tools.get_artist_overview',
  get_pending_submissions: 'tools.get_pending_submissions',
  get_system_health: 'tools.get_system_health',
  get_sync_job_status: 'tools.get_sync_job_status',
  get_recent_app_errors: 'tools.get_recent_app_errors',
  get_error_occurrences: 'tools.get_error_occurrences',
  get_storage_health: 'tools.get_storage_health',
  get_known_errors: 'tools.get_known_errors',
  get_support_ticket_status: 'tools.get_support_ticket_status',
  get_api_integration_status: 'tools.get_api_integration_status',
  prepare_epk_text: 'tools.prepare_epk_text',
  prepare_profile_update: 'tools.prepare_profile_update',
  prepare_release_draft: 'tools.prepare_release_draft',
  prepare_support_ticket: 'tools.prepare_support_ticket',
  prepare_error_report: 'tools.prepare_error_report',
} as const

type ToolKey = keyof typeof TOOL_KEYS

function useToolLabel(name: string): string {
  const t = useTranslations('ai')
  if (name in TOOL_KEYS) {
    return t(TOOL_KEYS[name as ToolKey])
  }
  return TOOL_LABELS[name] ?? name.replaceAll('_', ' ')
}

export function ToolActivity({ activity }: { activity: UiToolActivity }) {
  const t = useTranslations('ai')
  const label = useToolLabel(activity.toolName)
  const duration =
    activity.durationMs !== null ? t('toolDuration', { ms: activity.durationMs }) : null
  const status =
    activity.status === 'running'
      ? t('toolRunning')
      : activity.status === 'ok'
        ? t('toolCompleted')
        : activity.status === 'no_data'
          ? t('toolNoData')
          : t('toolFailed')
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        activity.status === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : activity.status === 'no_data'
            ? 'border-border bg-muted/30 text-muted-foreground'
            : 'border-border/70 bg-muted/20 text-muted-foreground',
      )}
      role="status"
    >
      {activity.status === 'running' ? (
        <CircleNotch
          className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      ) : activity.status === 'ok' ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
      ) : activity.status === 'no_data' ? (
        <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Warning className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground/90">{label}</span>
      <span className="shrink-0 tabular-nums">{status}</span>
      {duration ? (
        <span className="shrink-0 tabular-nums text-muted-foreground/70">{duration}</span>
      ) : null}
    </div>
  )
}
