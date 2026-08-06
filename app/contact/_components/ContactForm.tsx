'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useLocale, useTranslations } from 'next-intl'
import type { ContactTopicConfig } from '@/types'

/** Built-in fallback topics used when no custom topics are configured. */
const DEFAULT_TOPICS: ContactTopicConfig[] = [
  { value: 'label', label_de: 'Label', label_en: 'Label' },
  { value: 'shop', label_de: 'Shop', label_en: 'Shop' },
  { value: 'booking', label_de: 'Booking', label_en: 'Booking' },
  { value: 'other', label_de: 'Sonstiges', label_en: 'Other' },
]

interface FormState {
  name: string
  email: string
  topic: string
  message: string
  gdprConsent: boolean
  website: string
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

interface ContactFormProps {
  contactTopics: ContactTopicConfig[]
}

export function ContactForm({ contactTopics }: ContactFormProps) {
  const t = useTranslations('contact')
  const locale = useLocale()
  const topics = contactTopics.length > 0 ? contactTopics : DEFAULT_TOPICS
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    topic: topics[0]?.value ?? 'other',
    message: '',
    gdprConsent: false,
    website: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [status, setStatus] = useState<Status>('idle')

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) next.name = t('validationName')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = t('validationEmail')
    if (form.message.trim().length < 20) next.message = t('validationMessage')
    if (!form.gdprConsent) next.gdprConsent = t('validationConsent')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setStatus('submitting')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          topic: form.topic,
          message: form.message,
          gdprConsent: form.gdprConsent,
          website: form.website,
        }),
      })
      if (!res.ok) throw new Error('server error')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div
        className="rounded-lg border border-primary/30 bg-primary/10 p-8 text-center space-y-2"
        role="status"
        aria-live="polite"
      >
        <p className="text-2xl font-bold">{t('successTitle')}</p>
        <p className="text-muted-foreground font-serif">{t('successMessage')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Honeypot — hidden from real users */}
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none h-0 w-0 overflow-hidden"
        autoComplete="off"
      />

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="contact-name">{t('nameLabel')}</Label>
          <Input
            id="contact-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'contact-name-error' : undefined}
            className={errors.name ? 'border-red-500' : ''}
          />
          {errors.name && (
            <p id="contact-name-error" role="alert" className="text-xs text-red-400">
              {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">{t('emailLabel')}</Label>
          <Input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'contact-email-error' : undefined}
            className={errors.email ? 'border-red-500' : ''}
          />
          {errors.email && (
            <p id="contact-email-error" role="alert" className="text-xs text-red-400">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-topic">{t('topicLabel')}</Label>
        <select
          id="contact-topic"
          value={form.topic}
          onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {topics.map((t) => (
            <option key={t.value} value={t.value}>
              {locale === 'de' ? t.label_de : t.label_en}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">{t('messageLabel')}</Label>
        <Textarea
          id="contact-message"
          rows={6}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          placeholder={t('messagePlaceholder')}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? 'contact-message-error' : undefined}
          className={errors.message ? 'border-red-500' : ''}
        />
        {errors.message && (
          <p id="contact-message-error" role="alert" className="text-xs text-red-400">
            {errors.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="contact-gdpr"
            checked={form.gdprConsent}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, gdprConsent: checked === true }))
            }
            aria-invalid={!!errors.gdprConsent}
            aria-describedby={errors.gdprConsent ? 'contact-gdpr-error' : undefined}
            className={errors.gdprConsent ? 'border-red-500' : ''}
          />
          <Label htmlFor="contact-gdpr" className="text-sm text-muted-foreground leading-snug cursor-pointer">
            {t('gdprConsent')}
          </Label>
        </div>
        {errors.gdprConsent && (
          <p id="contact-gdpr-error" role="alert" className="text-xs text-red-400">
            {errors.gdprConsent}
          </p>
        )}
      </div>

      {status === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4" role="alert" aria-live="assertive">
          <p className="text-sm font-semibold text-red-400">{t('errorTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('errorMessage')}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full min-h-[44px] bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
      >
        {status === 'submitting' ? t('submitting') : t('submit')}
      </Button>

      <p className="text-xs text-muted-foreground/60 text-center">{t('spamDisclaimer')}</p>
    </form>
  )
}
