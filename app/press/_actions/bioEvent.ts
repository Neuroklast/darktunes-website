'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logBioEvent, type LogBioEventInput } from '@/lib/api/bioEvents'

export async function trackBioEvent(
  input: LogBioEventInput,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let journalistId = input.journalistId ?? null
    if (user && journalistId === undefined) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
      if (profile && ['journalist', 'admin'].includes(profile.role)) {
        journalistId = user.id
      } else {
        journalistId = null
      }
    }

    await logBioEvent(supabase, { ...input, journalistId })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}