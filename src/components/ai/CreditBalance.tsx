'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

interface Balance { enabled: boolean; limit: number; used: number; remaining: number }

export function CreditBalance({ artistId, refreshKey }: { artistId: string | null; refreshKey: string }) {
  const [balance, setBalance] = useState<Balance | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await createBrowserSupabaseClient().auth.getSession()
      if (!data.session?.access_token) return
      const params = new URLSearchParams()
      if (artistId) params.set('artist_id', artistId)
      const response = await fetch(`/api/ai/usage?${params}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store',
      })
      if (!response.ok) return
      const json = await response.json() as { credits?: Balance }
      if (!cancelled) setBalance(json.credits ?? null)
    }
    void load()
    return () => { cancelled = true }
  }, [artistId, refreshKey])
  if (!balance?.enabled) return null
  return <div className="px-3 pb-2 text-xs text-muted-foreground" aria-label="KI-Creditkontingent">
    <div className="flex justify-between gap-2"><span>KI-Credits diesen Monat</span>
      <span className="tabular-nums">{balance.remaining.toLocaleString('de-DE')} / {balance.limit.toLocaleString('de-DE')}</span></div>
    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" role="progressbar"
      aria-valuemin={0} aria-valuemax={balance.limit} aria-valuenow={balance.remaining}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${balance.limit > 0 ? 100 * balance.remaining / balance.limit : 0}%` }} />
    </div>
  </div>
}
