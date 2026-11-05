import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ActiveUserRole } from '@/lib/rbac/normalizeRole'
import { normalizeRole, normalizeRoles } from '@/lib/rbac/normalizeRole'

/**
 * Fetches a user's primary role from the database (deprecated `press` → `journalist`).
 * Wrapped in React's `cache` to deduplicate identical calls during the same server request.
 */
export const getUserRole = cache(async (userId: string): Promise<ActiveUserRole | null> => {
  const { createServerClient } = await import('@supabase/ssr')
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const { serverEnv } = await import('@/lib/env.server')

  const supabase = createServerClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // safe to ignore
          }
        },
      },
    },
  )
  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error('Failed to load user role', { cause: error })
  return normalizeRole(profile?.role ?? null)
})

/**
 * Fetches a user's primary role using a specific Supabase client.
 * Wrapped in React's `cache` to deduplicate identical calls during the same server request.
 */
export const getUserRoleWithClient = cache(async (
  client: ReturnType<typeof createClient<Database>>,
  userId: string,
): Promise<ActiveUserRole | null> => {
  const { data: profile, error } = await client
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error('Failed to load user role', { cause: error })
  return normalizeRole(profile?.role ?? null)
})

/** All system roles held by the user (`user_roles` + primary), with `press` aliased. */
export const getUserRolesWithClient = cache(async (
  client: ReturnType<typeof createClient<Database>>,
  userId: string,
): Promise<ActiveUserRole[]> => {
  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    client.from('users').select('role').eq('id', userId).maybeSingle(),
    client.from('user_roles').select('role').eq('user_id', userId),
  ])

  if (profileError || rolesError) {
    throw new Error('Failed to load assigned user roles', { cause: profileError ?? rolesError })
  }

  return normalizeRoles([
    profile?.role ?? '',
    ...(roleRows ?? []).map((row) => row.role),
  ].filter(Boolean))
})