'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AccountingWorkspaceConfig } from '@/lib/api/sosAccountingWorkspaces'
import {
  DEFAULT_SOS_ACCOUNTING_SETTINGS,
  settingsFingerprint,
  type SosAccountingSettings,
} from '@/lib/sos/sosAccountingSettings'
import {
  clearLegacyKvKeys,
  isKvMigrationComplete,
  markKvMigrationComplete,
  mergeKvIntoSettings,
  readLegacyKvSettings,
} from '@/lib/sos/migrateKvToDb'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { logClientAppEvent } from '@/lib/sos/clientAppLog'

const AUTO_SAVE_DEBOUNCE_MS = 2_000

export interface PeriodKey {
  start: string
  end: string
}

interface WorkspaceApiResponse {
  workspace?: {
    config?: AccountingWorkspaceConfig
    updated_at?: string
    updated_by?: string | null
  } | null
}

interface DefaultPresetApiResponse {
  preset?: {
    config?: AccountingWorkspaceConfig
    updated_at?: string
  }
}

export interface UseSosWorkspaceSyncOptions {
  currentPeriodKey: PeriodKey | null
  settings: SosAccountingSettings
  applySettings: (settings: SosAccountingSettings) => void
  bronzeBatchIds: string[]
  disabled?: boolean
}

export function useSosWorkspaceSync({
  currentPeriodKey,
  settings,
  applySettings,
  bronzeBatchIds,
  disabled = false,
}: UseSosWorkspaceSyncOptions) {
  const [settingsReady, setSettingsReady] = useState(false)
  const [workspaceLoadedAt, setWorkspaceLoadedAt] = useState<string | null>(null)
  const [workspaceUpdatedBy, setWorkspaceUpdatedBy] = useState<string | null>(null)
  const [defaultPresetLoadedAt, setDefaultPresetLoadedAt] = useState<string | null>(null)
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false)
  const [isWorkspaceSaving, setIsWorkspaceSaving] = useState(false)
  const [isSettingsDirty, setIsSettingsDirty] = useState(false)
  const [isPeriodWorkspaceReady, setIsPeriodWorkspaceReady] = useState(false)
  const [isDefaultPresetReady, setIsDefaultPresetReady] = useState(false)
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false)

  const t = useAccountingLabels()
  const lastSavedFingerprintRef = useRef<string | null>(null)
  const suppressAutoSaveRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootstrapStartedRef = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const clearSavedFingerprint = useCallback(() => {
    lastSavedFingerprintRef.current = null
  }, [])

  const markSynced = useCallback(
    (
      nextSettings: SosAccountingSettings,
      updatedAt: string | null,
      updatedBy: string | null,
    ) => {
      lastSavedFingerprintRef.current = settingsFingerprint(nextSettings)
      setIsSettingsDirty(false)
      setWorkspaceLoadedAt(updatedAt)
      setWorkspaceUpdatedBy(updatedBy)
      setDefaultPresetLoadedAt(null)
    },
    [],
  )

  const markDefaultSynced = useCallback((nextSettings: SosAccountingSettings, updatedAt: string | null) => {
    lastSavedFingerprintRef.current = settingsFingerprint(nextSettings)
    setIsSettingsDirty(false)
    setDefaultPresetLoadedAt(updatedAt)
    setWorkspaceLoadedAt(null)
    setWorkspaceUpdatedBy(null)
  }, [])

  const saveWorkspace = useCallback(
    async (nextSettings: SosAccountingSettings, periodKey: PeriodKey): Promise<boolean> => {
      setIsWorkspaceSaving(true)
      try {
        const res = await fetch('/api/admin/sos/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_start: periodKey.start,
            period_end: periodKey.end,
            config: nextSettings,
            bronze_batch_ids: bronzeBatchIds,
          }),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err?.error || t.workspaceSaveError)
        }

        const json = (await res.json()) as WorkspaceApiResponse
        const ws = json.workspace
        markSynced(
          nextSettings,
          ws?.updated_at ?? new Date().toISOString(),
          ws?.updated_by ?? null,
        )
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : t.workspaceSaveFailed
        toast.error(msg)
        void logClientAppEvent('useSosWorkspaceSync', msg, 'error', {
          action: 'saveWorkspace',
          periodStart: periodKey.start,
          periodEnd: periodKey.end,
        })
        return false
      } finally {
        setIsWorkspaceSaving(false)
      }
    },
    [bronzeBatchIds, markSynced, t.workspaceSaveError, t.workspaceSaveFailed],
  )

  const saveDefaultPreset = useCallback(
    async (nextSettings: SosAccountingSettings): Promise<boolean> => {
      setIsWorkspaceSaving(true)
      try {
        const res = await fetch('/api/admin/sos/presets/default', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: nextSettings }),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err?.error || t.workspaceDefaultSaveError)
        }

        const json = (await res.json()) as DefaultPresetApiResponse
        markDefaultSynced(
          nextSettings,
          json.preset?.updated_at ?? new Date().toISOString(),
        )
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : t.workspaceSaveFailed
        toast.error(msg)
        void logClientAppEvent('useSosWorkspaceSync', msg, 'error', { action: 'saveDefaultPreset' })
        return false
      } finally {
        setIsWorkspaceSaving(false)
      }
    },
    [markDefaultSynced, t.workspaceDefaultSaveError, t.workspaceSaveFailed],
  )

  const loadDefaultPreset = useCallback(async (): Promise<void> => {
    setIsWorkspaceLoading(true)
    try {
      const res = await fetch('/api/admin/sos/presets/default')
      if (!res.ok) return

      const json = (await res.json()) as DefaultPresetApiResponse
      const preset = json.preset
      if (preset?.config) {
        suppressAutoSaveRef.current = true
        applySettings(preset.config)
        markDefaultSynced(
          preset.config,
          preset.updated_at ?? new Date().toISOString(),
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.workspaceLoadFailed
      console.warn('[useSosWorkspaceSync] default preset load failed', e)
      void logClientAppEvent('useSosWorkspaceSync', msg, 'warn', { action: 'loadDefaultPreset' })
    } finally {
      setIsWorkspaceLoading(false)
      setIsDefaultPresetReady(true)
      window.setTimeout(() => {
        suppressAutoSaveRef.current = false
      }, 0)
    }
  }, [applySettings, markDefaultSynced, t.workspaceLoadFailed])

  const loadPeriodWorkspace = useCallback(
    async (periodKey: PeriodKey): Promise<void> => {
      setIsWorkspaceLoading(true)
      try {
        const params = new URLSearchParams({
          periodStart: periodKey.start,
          periodEnd: periodKey.end,
        })
        const res = await fetch(`/api/admin/sos/workspaces?${params}`)
        if (!res.ok) {
          setWorkspaceLoadedAt(null)
          setWorkspaceUpdatedBy(null)
          clearSavedFingerprint()
          return
        }

        const json = (await res.json()) as WorkspaceApiResponse
        const ws = json.workspace
        if (ws?.config) {
          const incomingHasRules =
            (ws.config.splitFees?.length ?? 0) > 0 ||
            (ws.config.compilationFilters?.length ?? 0) > 0 ||
            (ws.config.artistMappings?.length ?? 0) > 0
          const current = settingsRef.current
          const currentHasRules =
            current.splitFees.length > 0 ||
            current.compilationFilters.length > 0 ||
            current.artistMappings.length > 0
          if (!incomingHasRules && currentHasRules) {
            setWorkspaceLoadedAt(null)
            setWorkspaceUpdatedBy(null)
            clearSavedFingerprint()
            return
          }
          suppressAutoSaveRef.current = true
          applySettings(ws.config)
          markSynced(
            ws.config,
            ws.updated_at ?? new Date().toISOString(),
            ws.updated_by ?? null,
          )
        } else {
          setWorkspaceLoadedAt(null)
          setWorkspaceUpdatedBy(null)
          clearSavedFingerprint()
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : t.workspaceLoadFailed
        console.warn('[useSosWorkspaceSync] period load failed', e)
        void logClientAppEvent('useSosWorkspaceSync', msg, 'warn', {
          action: 'loadPeriodWorkspace',
          periodStart: periodKey.start,
          periodEnd: periodKey.end,
        })
        clearSavedFingerprint()
      } finally {
        setIsWorkspaceLoading(false)
        setIsPeriodWorkspaceReady(true)
        window.setTimeout(() => {
          suppressAutoSaveRef.current = false
        }, 0)
      }
    },
    [applySettings, clearSavedFingerprint, markSynced, t.workspaceLoadFailed],
  )

  const performLoadFromServer = useCallback(async (): Promise<void> => {
    if (currentPeriodKey) {
      await loadPeriodWorkspace(currentPeriodKey)
      return
    }
    await loadDefaultPreset()
  }, [currentPeriodKey, loadDefaultPreset, loadPeriodWorkspace])

  const loadFromServer = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (isSettingsDirty && !options?.force) {
        setReloadConfirmOpen(true)
        return
      }

      setReloadConfirmOpen(false)
      await performLoadFromServer()
    },
    [isSettingsDirty, performLoadFromServer],
  )

  const confirmReloadFromServer = useCallback(async (): Promise<void> => {
    await loadFromServer({ force: true })
  }, [loadFromServer])

  const persistImportedSettings = useCallback(
    async (nextSettings: SosAccountingSettings): Promise<boolean> => {
      const defaultOk = await saveDefaultPreset(nextSettings)
      if (!currentPeriodKey) {
        if (defaultOk) toast.success(t.workspaceDefaultSaveSuccess)
        return defaultOk
      }
      const periodOk = await saveWorkspace(nextSettings, currentPeriodKey)
      const ok = defaultOk && periodOk
      if (ok) toast.success(t.workspaceSaveSuccess)
      return ok
    },
    [currentPeriodKey, saveDefaultPreset, saveWorkspace, t.workspaceDefaultSaveSuccess, t.workspaceSaveSuccess],
  )

  const saveCurrentWorkspace = useCallback(async (): Promise<boolean> => {
    if (!currentPeriodKey) {
      const ok = await saveDefaultPreset(settings)
      if (ok) toast.success(t.workspaceDefaultSaveSuccess)
      return ok
    }
    const ok = await saveWorkspace(settings, currentPeriodKey)
    if (ok) toast.success(t.workspaceSaveSuccess)
    return ok
  }, [currentPeriodKey, settings, saveDefaultPreset, saveWorkspace, t.workspaceDefaultSaveSuccess, t.workspaceSaveSuccess])

  // One-time KV migration + default preset bootstrap.
  useEffect(() => {
    if (bootstrapStartedRef.current) return
    bootstrapStartedRef.current = true

    void (async () => {
      try {
        if (!isKvMigrationComplete()) {
          const legacy = await readLegacyKvSettings()
          if (legacy.hasData) {
            const res = await fetch('/api/admin/sos/presets/default')
            if (res.ok) {
              const json = await res.json() as DefaultPresetApiResponse
              const current = json.preset?.config ?? DEFAULT_SOS_ACCOUNTING_SETTINGS
              const merged = mergeKvIntoSettings(current, legacy.settings)
              await fetch('/api/admin/sos/presets/default', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: merged }),
              })
            }
            await clearLegacyKvKeys()
          }
          markKvMigrationComplete()
        }
      } catch {
        // Non-fatal — default preset load still runs
      } finally {
        await loadDefaultPreset()
        setSettingsReady(true)
      }
    })()
  }, [loadDefaultPreset])

  // Load server workspace when period changes (server is SSOT for period-keyed settings).
  useEffect(() => {
    if (!currentPeriodKey || !settingsReady) {
      setIsPeriodWorkspaceReady(false)
      return
    }

    setIsPeriodWorkspaceReady(false)
    let cancelled = false
    void (async () => {
      await loadPeriodWorkspace(currentPeriodKey)
      if (cancelled) setIsPeriodWorkspaceReady(false)
    })()

    return () => {
      cancelled = true
    }
  }, [currentPeriodKey, settingsReady, loadPeriodWorkspace])

  // Track dirty state and debounced auto-save.
  useEffect(() => {
    if (!settingsReady || disabled) return

    const fingerprint = settingsFingerprint(settings)
    const saved = lastSavedFingerprintRef.current

    if (!currentPeriodKey) {
      if (!isDefaultPresetReady || suppressAutoSaveRef.current) return

      if (saved !== null && fingerprint === saved) {
        setIsSettingsDirty(false)
        return
      }

      setIsSettingsDirty(true)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        void saveDefaultPreset(settings)
      }, AUTO_SAVE_DEBOUNCE_MS)
      return () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      }
    }

    if (!isPeriodWorkspaceReady || suppressAutoSaveRef.current) return

    if (saved !== null && fingerprint === saved) {
      setIsSettingsDirty(false)
      return
    }

    setIsSettingsDirty(true)

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      void saveWorkspace(settings, currentPeriodKey)
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [
    settings,
    settingsReady,
    currentPeriodKey,
    isPeriodWorkspaceReady,
    isDefaultPresetReady,
    disabled,
    saveDefaultPreset,
    saveWorkspace,
  ])

  return {
    settingsReady,
    workspaceLoadedAt,
    workspaceUpdatedBy,
    defaultPresetLoadedAt,
    isWorkspaceLoading,
    isWorkspaceSaving,
    isSettingsDirty,
    loadFromServer,
    confirmReloadFromServer,
    reloadConfirmOpen,
    setReloadConfirmOpen,
    loadDefaultPreset,
    saveCurrentWorkspace,
    persistImportedSettings,
  }
}