/**
 * Maps sync failure signals to short, product-facing admin messages.
 * Never expose hosting/infra setup (R2, Vercel, Supabase Cron, secrets, Edge Functions).
 */

export interface UserFacingError {
  title: string
  message: string
  fixHint: string | null
}

export function describeSyncQueueIssue(input: {
  executorNeverRan: boolean
  executorOffline: boolean
  backlog: number
  youtubeUnconfigured: boolean
  youtubeIdle: boolean
  cronSecretMissing: boolean
}): UserFacingError[] {
  const out: UserFacingError[] = []

  if (input.cronSecretMissing) {
    out.push({
      title: 'Automatic sync unavailable',
      message: 'Background sync cannot start until technical setup is completed by the site operator.',
      fixHint: 'Contact your technical operator. Label admins cannot configure this from the dashboard.',
    })
  }

  if (input.executorNeverRan && input.backlog > 0) {
    out.push({
      title: 'Sync not processing',
      message: `${input.backlog} job(s) are waiting, but automatic processing has not started yet.`,
      fixHint:
        'Use Force Sync All on this page, or contact your technical operator if jobs stay stuck.',
    })
  } else if (input.executorOffline && input.backlog > 0) {
    out.push({
      title: 'Sync processor idle',
      message: `${input.backlog} job(s) are waiting and automatic processing looks stalled.`,
      fixHint:
        'Use Force Sync All on this page, or contact your technical operator if the backlog does not clear.',
    })
  }

  if (input.youtubeUnconfigured) {
    out.push({
      title: 'YouTube not configured',
      message: 'Channel video sync needs an API key and channel ID.',
      fixHint: 'Add youtube_api_key and youtube_channel_id under Admin → API Keys.',
    })
  } else if (input.youtubeIdle) {
    out.push({
      title: 'YouTube sync never ran',
      message: 'No YouTube channel sync has completed yet.',
      fixHint: 'Run Sync YouTube on this page after credentials are set under API Keys.',
    })
  }

  return out
}

export function describeJobError(errorMessage: string | null): string {
  if (!errorMessage) return 'No error details.'
  const msg = errorMessage.trim()
  if (msg.includes('Rate limited') || msg.includes('429')) {
    return 'Provider rate-limited this job. It was rescheduled with a cooldown (not retried in a tight loop).'
  }
  if (msg.includes('quota') || msg.includes('YOUTUBE_QUOTA')) {
    return 'YouTube API quota is exhausted for today. Try again after the daily quota resets.'
  }
  if (msg.includes('CRON_SECRET') || msg.includes('Unauthorized') || msg.includes('401')) {
    return 'Sync authentication failed. Contact your technical operator — this cannot be fixed from the label admin.'
  }
  if (msg.includes('Cancelled by admin') || msg.includes('Cancel requested')) {
    return 'Cancelled from the Advanced job console.'
  }
  return msg.length > 280 ? `${msg.slice(0, 280)}…` : msg
}
