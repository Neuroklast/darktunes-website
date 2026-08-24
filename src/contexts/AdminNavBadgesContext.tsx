'use client'

/**
 * Single owner for admin nav realtime badge subscriptions.
 *
 * AdminSidebarNav and AdminPushBootstrap both need badge counts. Mounting
 * `useAdminNavBadges` twice against the singleton browser Supabase client caused:
 *   Error: cannot add `postgres_changes` callbacks for realtime:admin-nav-portal-messages
 *   after `subscribe()`.
 *
 * This provider subscribes once; consumers read the shared snapshot.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  EMPTY_ADMIN_NAV_BADGES,
  useAdminNavBadges,
  type AdminNavBadges,
} from '@/hooks/useAdminNavBadges'

const AdminNavBadgesContext = createContext<AdminNavBadges>(EMPTY_ADMIN_NAV_BADGES)

export function AdminNavBadgesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext()
  // Admin layout is auth-gated; enable for any signed-in user so push badge
  // and nav counters share one realtime set (editors included).
  const badges = useAdminNavBadges(user?.id ?? null, Boolean(user?.id))

  return (
    <AdminNavBadgesContext.Provider value={badges}>
      {children}
    </AdminNavBadgesContext.Provider>
  )
}

export function useAdminNavBadgesContext(): AdminNavBadges {
  return useContext(AdminNavBadgesContext)
}
