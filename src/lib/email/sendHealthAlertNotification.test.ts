import { describe, it, expect, vi } from 'vitest'
import { sendHealthAlertNotification } from './sendHealthAlertNotification'
import type { HealthResponse } from '@/lib/health/types'

const snapshot: HealthResponse = {
  status: 'unhealthy',
  statusLabel: 'Action required',
  statusDetail: 'Database unreachable',
  healthScore: 0,
  app: { version: '1.6.0', commit: null },
  database: {
    status: 'offline',
    latencyMs: null,
    statusLabel: 'Unreachable',
    statusDetail: 'Down',
  },
  apis: {},
  syncQueue: null,
  cronHealth: null,
  kpis: {
    configuredApis: 0,
    operationalApis: 0,
    degradedApis: 0,
    failingApis: 0,
    staleApis: 0,
    unconfiguredApis: 0,
    idleApis: 0,
    avgSuccessRate24h: null,
  },
  alerts: [
    {
      id: 'db-offline',
      severity: 'critical',
      title: 'Database unreachable',
      message: 'Down',
      source: 'database',
    },
  ],
  checkedAt: '2026-06-23T12:00:00.000Z',
}

describe('sendHealthAlertNotification', () => {
  it('skips when RESEND_API_KEY is missing', async () => {
    const result = await sendHealthAlertNotification(snapshot, snapshot.alerts, {
      resendApiKey: '',
      resendFromEmail: 'noreply@darktunes.com',
      labelNotificationEmail: 'label@darktunes.com',
      siteUrl: 'https://darktunes.com',
      fetch: vi.fn(),
    })
    expect(result.success).toBe(false)
  })

  it('posts bundled critical alerts to Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    const result = await sendHealthAlertNotification(snapshot, snapshot.alerts, {
      resendApiKey: 'key',
      resendFromEmail: 'noreply@darktunes.com',
      labelNotificationEmail: 'label@darktunes.com',
      siteUrl: 'https://darktunes.com',
      fetch: fetchMock,
    })
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})