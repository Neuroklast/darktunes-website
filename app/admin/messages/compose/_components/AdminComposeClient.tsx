'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MessageComposer } from '@/components/messaging/MessageComposer'
import { useAuthContext } from '@/contexts/AuthContext'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getArtists } from '@/lib/api/artists'
import { getMessageTemplates } from '@/lib/api/labelMessages'
import type { MessageTemplate } from '@/types'

export function AdminComposeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading: authLoading, session } = useAuthContext()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const [artists, setArtists] = useState<Array<{ id: string; name: string }>>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [isLoadingArtists, setIsLoadingArtists] = useState(true)
  const [artistLoadError, setArtistLoadError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const defaultArtistId = searchParams.get('artistId') ?? undefined
  const defaultSubject = searchParams.get('subject') ?? undefined

  useEffect(() => {
    if (authLoading) return
    if (!session?.access_token || !session.refresh_token) {
      setIsLoadingArtists(false)
      setArtistLoadError('Please sign in again to load artists.')
      return
    }

    let cancelled = false
    const load = async () => {
      setIsLoadingArtists(true)
      setArtistLoadError(null)
      try {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
        const [artistRes, templateRes] = await Promise.allSettled([
          getArtists(supabase),
          getMessageTemplates(supabase),
        ])
        if (cancelled) return
        if (artistRes.status === 'fulfilled') {
          setArtists(artistRes.value.map((a) => ({ id: a.id, name: a.name })))
        } else {
          setArtistLoadError(
            artistRes.reason instanceof Error ? artistRes.reason.message : 'Failed to load artists',
          )
        }
        if (templateRes.status === 'fulfilled') {
          setTemplates(templateRes.value)
        }
      } catch (e) {
        if (!cancelled) {
          setArtistLoadError(e instanceof Error ? e.message : 'Failed to load data')
        }
      } finally {
        if (!cancelled) setIsLoadingArtists(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authLoading, session?.access_token, session?.refresh_token, supabase])

  const handleSend = useCallback(
    async (artistIds: string[], subject: string, html: string, text: string) => {
      setIsSending(true)
      try {
        const token = session?.access_token
        const res = await fetch('/api/admin/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            artistIds,
            subject,
            body: text,
            bodyHtml: html || null,
            clientMessageId:
              artistIds.length === 1 && typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : undefined,
          }),
        })
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(errBody.error ?? 'Failed to send message')
        }
        toast.success(`Message sent to ${artistIds.length} artist${artistIds.length === 1 ? '' : 's'}`)
        router.push('/admin/messages')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to send message')
        throw e
      } finally {
        setIsSending(false)
      }
    },
    [router, session?.access_token],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
        <Link href="/admin/messages">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to messages
        </Link>
      </Button>
      <Card>
        <CardContent className="p-6">
          <MessageComposer
            artists={artists}
            templates={templates}
            isSending={isSending}
            isArtistsLoading={isLoadingArtists}
            artistLoadError={artistLoadError}
            defaultArtistId={defaultArtistId}
            defaultSubject={defaultSubject}
            onSend={handleSend}
            onClose={() => router.push('/admin/messages')}
          />
        </CardContent>
      </Card>
    </div>
  )
}
