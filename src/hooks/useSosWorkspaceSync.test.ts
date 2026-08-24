import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSosWorkspaceSync } from './useSosWorkspaceSync'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/accountingFallbacks', () => ({ useAccountingLabels: () => ({
  workspaceSaveError: 'save error',
  workspaceSaveFailed: 'save failed',
  workspaceDefaultSaveError: 'default save error',
  workspaceLoadFailed: 'load failed',
  workspaceLoadError: 'load error',
  workspaceSaveSuccess: 'saved',
  workspaceDefaultSaveSuccess: 'default saved',
}) }))
vi.mock('@/lib/sos/clientAppLog', () => ({ logClientAppEvent: vi.fn() }))
vi.mock('@/lib/sos/migrateKvToDb', () => ({
  clearLegacyKvKeys: vi.fn(),
  isKvMigrationComplete: vi.fn().mockReturnValue(true),
  markKvMigrationComplete: vi.fn(),
  mergeKvIntoSettings: vi.fn((s: unknown) => s),
  readLegacyKvSettings: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/sos/sosAccountingSettings', () => ({
  DEFAULT_SOS_ACCOUNTING_SETTINGS: { version: 1 },
  settingsFingerprint: vi.fn(() => 'fp'),
}))

describe('useSosWorkspaceSync', () => {
  it('exposes confirmation toggles and load action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))

    const { result } = renderHook(() => useSosWorkspaceSync({
      currentPeriodKey: null,
      settings: { version: 1 } as never,
      applySettings: vi.fn(),
      bronzeBatchIds: [],
      disabled: true,
    }))

    expect(result.current.reloadConfirmOpen).toBe(false)

    act(() => {
      result.current.setReloadConfirmOpen(true)
    })

    expect(result.current.reloadConfirmOpen).toBe(true)
  })

  it('persistImportedSettings writes the Default preset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ preset: { updated_at: '2026-08-14T00:00:00.000Z' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSosWorkspaceSync({
      currentPeriodKey: null,
      settings: { version: 1 } as never,
      applySettings: vi.fn(),
      bronzeBatchIds: [],
      disabled: true,
    }))

    await act(async () => {
      const ok = await result.current.persistImportedSettings({ version: 1 } as never)
      expect(ok).toBe(true)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/sos/presets/default',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
