'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { Button } from '@/components/ui/button'
import type { AccreditationRequest } from '@/types'
import { createAccreditationRequest } from '../_actions/accreditation'

interface AccreditationClientProps {
  initialRequests: AccreditationRequest[]
}

export function AccreditationClient({ initialRequests }: AccreditationClientProps) {
  const t = useTranslations('pressDashboard')
  const [requests, setRequests] = useState(initialRequests)
  const [form, setForm] = useState({
    eventName: '',
    eventDate: '',
    publication: '',
    reason: '',
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const created = await createAccreditationRequest({
        eventName: form.eventName,
        eventDate: form.eventDate,
        publication: form.publication,
        reason: form.reason,
      })
      setRequests((prev) => [created, ...prev])
      setForm({ eventName: '', eventDate: '', publication: '', reason: '' })
      toast.success(t('accreditationForm.submitSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('accreditationForm.submitError'))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('accreditation')}</h1>
      <form onSubmit={submit} className="rounded-lg border border-border p-4 space-y-3">
        <div className="space-y-1">
          <Label>{t('accreditationForm.eventName')}</Label>
          <Input value={form.eventName} onChange={(e) => setForm((v) => ({ ...v, eventName: e.target.value }))} required />
        </div>
        <DateField
          id="accreditation-event-date"
          label={t('accreditationForm.eventDate')}
          value={form.eventDate}
          onChange={(v) => setForm((prev) => ({ ...prev, eventDate: v }))}
          required
        />
        <div className="space-y-1">
          <Label>{t('accreditationForm.publication')}</Label>
          <Input value={form.publication} onChange={(e) => setForm((v) => ({ ...v, publication: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <Label>{t('accreditationForm.reason')}</Label>
          <Textarea value={form.reason} onChange={(e) => setForm((v) => ({ ...v, reason: e.target.value }))} required rows={4} />
        </div>
        <Button type="submit">{t('accreditationForm.submit')}</Button>
      </form>

      <div className="space-y-3">
        {requests.map((request) => (
          <div key={request.id} className="rounded-lg border border-border p-4">
            <p className="font-medium">{request.eventName}</p>
            <p className="text-sm text-muted-foreground">
              {request.publication} · {request.eventDate} · {request.status}
            </p>
            {request.adminNote && (
              <p className="mt-2 text-sm text-muted-foreground">{t('accreditationForm.adminNote')}: {request.adminNote}</p>
            )}
          </div>
        ))}
        {requests.length === 0 && <p className="text-sm text-muted-foreground">{t('accreditationForm.noRequests')}</p>}
      </div>
    </div>
  )
}
