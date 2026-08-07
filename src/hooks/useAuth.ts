import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { UserProfile } from '@/types'

type ProfileRow = Database['public']['Tables']['users']['Row']

export interface ArtistMembership {
  artistId: string
  memberRole: 'owner' | 'member' | 'guest'
}

// Singleton browser client — uses @supabase/ssr cookie-based sessions
// so the Next.js middleware can read the auth state from cookies.
const supabase = createBrowserSupabaseClient()

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [artistMemberships, setArtistMemberships] = useState<ArtistMembership[]>([])

  async function fetchProfile(userId: string) {
    try {
      const [profileResult, membershipsResult] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, role, created_at, updated_at')
          .eq('id', userId)
          .single(),
        supabase
          .from('artist_members')
          .select('artist_id, member_role')
          .eq('user_id', userId),
      ])

      if (profileResult.error) throw profileResult.error

      const row = profileResult.data as ProfileRow
      setProfile({
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })

      const memberships: ArtistMembership[] = (membershipsResult.data ?? []).map((m) => ({
        artistId: m.artist_id,
        memberRole: m.member_role as ArtistMembership['memberRole'],
      }))
      setArtistMemberships(memberships)
    } catch (error) {
      console.error('Error fetching profile:', error)
      setProfile(null)
      setArtistMemberships([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setArtistMemberships([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { error }
  }

  const signOut = async (): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const signInWithOAuth = async (provider: 'google' | 'spotify'): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === 'spotify' ? 'user-read-email user-read-private' : undefined,
      },
    })
    return { error }
  }

  const isAdmin = profile?.role === 'admin'
  const isEditor = profile?.role === 'editor' || profile?.role === 'admin'
  // isArtist is now derived from artist_members, not profiles.role.
  // This allows a user to be both an editor and an artist simultaneously.
  const isArtist = artistMemberships.length > 0 || profile?.role === 'admin'

  return {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithOAuth,
    isAdmin,
    isEditor,
    isArtist,
    isAuthenticated: !!user,
    artistMemberships,
  }
}
