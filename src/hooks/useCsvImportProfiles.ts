'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { buildCsvProfileRegistry } from '@/lib/sos/ingest/csvProfileRegistry'
import type { CsvImportProfile } from '@/lib/sos/ingest/types'

interface GlobalProfileResponse {
  profiles: CsvImportProfile[]
  revision: string | null
}

/**
 * Profiles are global and server-confirmed, never tied to an accounting
 * period. A 409 refuses stale edits rather than silently losing updates.
 */
export function useCsvImportProfiles(
  customProfiles: CsvImportProfile[],
  setCustomProfiles: Dispatch<SetStateAction<CsvImportProfile[]>>,
) {
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const revisionRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const profilesRef = useRef(customProfiles)
  profilesRef.current = customProfiles

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/admin/sos/import-profiles', { cache: 'no-store' })
        if (!response.ok) throw new Error('Global import profiles could not be loaded.')
        const data = await response.json() as GlobalProfileResponse
        if (!cancelled) {
          revisionRef.current = data.revision
          setCustomProfiles(data.profiles.filter((p) => !p.isSystemDefault))
          setReady(true)
        }
      } catch (error) {
        if (!cancelled) {
          setReady(false)
          console.error('[useCsvImportProfiles]', error)
        }
      }
    })()
    return () => { cancelled = true }
  }, [setCustomProfiles])

  const { profiles, shadowedProfiles, nameConflicts } = useMemo(
    () => buildCsvProfileRegistry(customProfiles),
    [customProfiles],
  )

  const persist = useCallback(async (next: CsvImportProfile[]) => {
    if (!ready) throw new Error('Global import profiles have not been loaded.')
    if (busyRef.current) throw new Error('Another profile change is still being saved.')
    busyRef.current = true
    setSaving(true)
    try {
      const response = await fetch('/api/admin/sos/import-profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_revision: revisionRef.current, profiles: next }),
      })
      if (!response.ok) {
        const problem = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(problem.detail || 'Could not save import profiles.')
      }
      const result = await response.json() as GlobalProfileResponse
      revisionRef.current = result.revision
      setCustomProfiles(result.profiles)
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }, [ready, setCustomProfiles])

  const saveProfile = useCallback(async (profile: CsvImportProfile): Promise<void> => {
    if (profile.isSystemDefault || profile.id.startsWith('system-')) {
      throw new Error('System profiles cannot be changed.')
    }
    const prev = profilesRef.current
    const found = prev.find((p) => p.id === profile.id)
    const nextProfile = {
      ...profile,
      isSystemDefault: false as const,
      revision: (found?.revision ?? 0) + 1,
    }
    const next = found
      ? prev.map((p) => p.id === profile.id ? nextProfile : p)
      : [...prev, nextProfile]
    await persist(next)
  }, [persist])

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    await persist(profilesRef.current.filter((p) => p.id !== id))
  }, [persist])

  return { profiles, shadowedProfiles, nameConflicts, customProfiles, saveProfile, deleteProfile, ready, saving, editorOpen, setEditorOpen }
}
