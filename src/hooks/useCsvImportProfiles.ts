'use client'

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_CSV_PROFILES } from '@/lib/sos/ingest/default-profiles'
import type { CsvImportProfile } from '@/lib/sos/ingest/types'

export function useCsvImportProfiles(
  customProfiles: CsvImportProfile[],
  setCustomProfiles: Dispatch<SetStateAction<CsvImportProfile[]>>,
) {
  const profiles = useMemo(
    () => [...customProfiles, ...DEFAULT_CSV_PROFILES],
    [customProfiles],
  )

  const saveProfile = useCallback(
    (profile: CsvImportProfile) => {
      setCustomProfiles((prev) => {
        const idx = prev.findIndex((p) => p.id === profile.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = profile
          return next
        }
        return [...prev, profile]
      })
    },
    [setCustomProfiles],
  )

  const deleteProfile = useCallback(
    (id: string) => {
      setCustomProfiles((prev) => prev.filter((p) => p.id !== id))
    },
    [setCustomProfiles],
  )

  const [editorOpen, setEditorOpen] = useState(false)

  return {
    profiles,
    customProfiles,
    saveProfile,
    deleteProfile,
    editorOpen,
    setEditorOpen,
  }
}