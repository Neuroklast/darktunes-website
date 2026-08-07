import { useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

export type RolePermissionsRow = Database['public']['Tables']['role_permissions']['Row']

export function useRolePermissions() {
  const { profile, loading: authLoading } = useAuthContext()
  const [permissions, setPermissions] = useState<RolePermissionsRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return

    if (!profile || profile.role === 'admin') {
      setPermissions(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const supabase = createBrowserSupabaseClient()
    type DbRole = RolePermissionsRow['role']
    const role = profile.role as DbRole

    void supabase
      .from('role_permissions')
      .select(
        'role, can_publish_news, can_edit_news, can_manage_artists, can_manage_releases, can_manage_videos, can_view_admin_panel, updated_at, updated_by',
      )
      .eq('role', role)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        if (queryError) {
          setPermissions(null)
          setError(queryError.message)
        } else {
          setPermissions(data)
          setError(null)
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, profile])

  const isAdmin = profile?.role === 'admin'

  return {
    permissions,
    loading: authLoading || loading,
    error,
    isAdmin,
    hasFullAccess: isAdmin,
  }
}