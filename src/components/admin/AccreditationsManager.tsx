'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { listRequests, updateStatus } from '@/lib/api/accreditations'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

export function AccreditationsManager() {
  const t = useTranslations('admin.accreditations')

  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof listRequests>>>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const rows = await listRequests(supabase, getClientOrganizationId())
      setRequests(rows)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loadError'))
    }
  }, [supabase, t])

  useEffect(() => {
    void load()
  }, [load])

  const mutate = async (id: string, status: 'approved' | 'rejected', existingAdminNote: string | undefined) => {
    setLoadingId(id)
    try {
      // If the admin hasn't typed anything new in the textarea, preserve the existing note.
      const updatedNote = notes[id] !== undefined ? notes[id] : (existingAdminNote || null)
      await updateStatus(supabase, id, status, updatedNote, getClientOrganizationId())
      const statusText = status === 'approved' ? t('approved') : t('rejected')
      toast.success(t('updateSuccess', { status: statusText }))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateError'))
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('whatIsHeading')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('whatIsDescription')}
        </p>
      </div>
      {requests.map((request) => (
        <div key={request.id} className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-medium">{request.eventName}</p>
              <div className={`px-2 py-0.5 rounded text-xs font-semibold ${
                request.status === 'approved' ? 'bg-green-100 text-green-800' :
                request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {request.status === 'approved' ? t('approved') : request.status === 'rejected' ? t('rejected') : t('pending')}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {request.publication} · {request.eventDate}
            </p>
          </div>
          <p className="text-sm border-l-2 border-primary/20 pl-3 italic">{request.reason}</p>
          <Textarea
            value={notes[request.id] ?? request.adminNote ?? ''}
            onChange={(e) => setNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
            placeholder={t('internalNote')}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={request.status === 'approved' ? 'default' : 'outline'}
              disabled={loadingId === request.id || request.status === 'approved'}
              onClick={() => void mutate(request.id, 'approved', request.adminNote)}
            >
              {t('approve')}
            </Button>
            <Button
              size="sm"
              variant={request.status === 'rejected' ? 'default' : 'destructive'}
              disabled={loadingId === request.id || request.status === 'rejected'}
              onClick={() => void mutate(request.id, 'rejected', request.adminNote)}
            >
              {t('reject')}
            </Button>
          </div>
        </div>
      ))}
      {requests.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('noRequests')}</p>
      )}
    </div>
  )
}
