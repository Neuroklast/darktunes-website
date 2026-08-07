import { describe, it, expect, afterEach, vi } from 'vitest'
import { getVapidConfig, getVapidPublicKey, isWebPushConfigured } from './vapid'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('vapid', () => {
  it('reports unconfigured when keys missing', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    expect(isWebPushConfigured()).toBe(false)
    expect(getVapidPublicKey()).toBeNull()
    expect(getVapidConfig()).toBeNull()
  })

  it('returns config when both keys set', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-test')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-test')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:ops@example.com')
    expect(isWebPushConfigured()).toBe(true)
    expect(getVapidPublicKey()).toBe('public-test')
    expect(getVapidConfig()).toEqual({
      publicKey: 'public-test',
      privateKey: 'private-test',
      subject: 'mailto:ops@example.com',
    })
  })
})
