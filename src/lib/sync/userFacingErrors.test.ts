import { describe, it, expect } from 'vitest'
import { describeJobError, describeSyncQueueIssue } from './userFacingErrors'

describe('describeSyncQueueIssue', () => {
  it('explains executor offline with backlog', () => {
    const issues = describeSyncQueueIssue({
      executorNeverRan: false,
      executorOffline: true,
      backlog: 3,
      youtubeUnconfigured: false,
      youtubeIdle: false,
      cronSecretMissing: false,
    })
    expect(issues.some((i) => i.title === 'Sync processor idle')).toBe(true)
    expect(issues[0]?.fixHint).toMatch(/Force Sync All|technical operator/i)
    expect(issues[0]?.fixHint).not.toMatch(/CRON_SECRET|Supabase|Vercel|Edge Function/i)
  })
})

describe('describeJobError', () => {
  it('maps rate limit messages', () => {
    expect(describeJobError('Rate limited — rescheduled')).toMatch(/cooldown/i)
  })
})
