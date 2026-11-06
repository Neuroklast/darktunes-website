'use client'

/**
 * Structured label identity form for Accounting (PDF branding + SEPA).
 * All fields in normal form — no free-text multi-line address.
 */

import { Buildings, Coins } from '@phosphor-icons/react'
import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LabelInfo } from '@/lib/sos/types'
import { LabelAddressFields } from '@/components/admin/sos/fields/LabelAddressFields'
import { EmailField, IbanField } from '@/components/admin/sos/fields/AccountingTextFields'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { DEFAULT_LABEL_INFO } from '@/lib/sos/defaults'

export interface LabelIdentityManagerProps {
  labelInfo: LabelInfo | Partial<LabelInfo>
  onUpdate: (next: LabelInfo) => void
  /** Compact layout without outer page title (e.g. inside Rules tab). */
  embedded?: boolean
}

function mergeLabel(partial: Partial<LabelInfo>, patch: Partial<LabelInfo>): LabelInfo {
  const sepaRaw = patch.sepaIban !== undefined ? patch.sepaIban : partial.sepaIban
  return {
    ...DEFAULT_LABEL_INFO,
    ...partial,
    ...patch,
    name: (patch.name ?? partial.name ?? DEFAULT_LABEL_INFO.name).trim() || DEFAULT_LABEL_INFO.name,
    address: patch.address ?? partial.address ?? DEFAULT_LABEL_INFO.address,
    sepaIban: sepaRaw ? sepaRaw.replace(/[\s-]/g, '').toUpperCase() : sepaRaw,
  }
}

const MAX_LOGO_BYTES = 4 * 1024 * 1024
const ACCEPTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function LabelIdentityManager({
  labelInfo,
  onUpdate,
  embedded = false,
}: LabelIdentityManagerProps) {
  const t = useAccountingLabels()
  const [logoError, setLogoError] = useState<string | null>(null)
  const logoPreview = labelInfo.logoBase64 || labelInfo.logo
  const patch = (partial: Partial<LabelInfo>) => onUpdate(mergeLabel(labelInfo, partial))

  const handleLogoFile = (file?: File) => {
    if (!file) return
    if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
      setLogoError(t.uiLogoInvalidType)
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(t.uiLogoTooLarge)
      return
    }
    setLogoError(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
        setLogoError(t.uiLogoUnreadable)
        return
      }
      patch({ logo: reader.result, logoBase64: reader.result, logoAssetId: undefined })
    }
    reader.onerror = () => setLogoError(t.uiLogoUnreadable)
    reader.readAsDataURL(file)
  }

  const body = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="label-identity-logo">{t.uiLogoTitle}</Label>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 p-3">
          {logoPreview ? (
            <div className="flex h-24 w-48 items-center justify-center rounded-md bg-white p-2">
              <Image src={logoPreview} width={184} height={80} alt={t.uiLogoAlt}
                unoptimized className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.uiLogoMissing}</p>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Input id="label-identity-logo" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              className="h-auto py-2 text-sm"
              onChange={event => {
                handleLogoFile(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }} />
            <p className="text-xs text-muted-foreground">{t.uiLogoHelp}</p>
            {logoPreview && <Button type="button" size="sm" variant="outline"
              onClick={() => { patch({ logo: undefined, logoBase64: undefined, logoAssetId: undefined }); setLogoError(null) }}>
              {t.uiLogoRemove}
            </Button>}
          </div>
        </div>
        {logoError && <p className="text-sm text-destructive" role="alert">{logoError}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="label-identity-name">{t.setupLabelName}</Label>
        <Input
          id="label-identity-name"
          value={labelInfo.name ?? ''}
          maxLength={200}
          onChange={(e) => patch({ name: e.target.value.slice(0, 200) })}
          autoComplete="organization"
        />
      </div>

      <LabelAddressFields
        idPrefix="label-identity"
        value={labelInfo.address ?? ''}
        onChange={(address) => patch({ address })}
        required
      />

      <div className="space-y-4 rounded-md border border-border/60 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Coins size={14} aria-hidden="true" />
          {t.setupLegalHeading}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="label-identity-tax-id">{t.setupVatId}</Label>
            <Input
              id="label-identity-tax-id"
              value={labelInfo.taxId ?? ''}
              onChange={(e) =>
                patch({
                  taxId: e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 20) || undefined,
                })
              }
              placeholder="DE123456789"
              maxLength={20}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="label-identity-tax-number">{t.setupTaxNumber}</Label>
            <Input
              id="label-identity-tax-number"
              value={labelInfo.taxNumber ?? ''}
              onChange={(e) => patch({ taxNumber: e.target.value.slice(0, 40) || undefined })}
              maxLength={40}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="label-identity-legal">{t.setupLegalForm}</Label>
            <Input
              id="label-identity-legal"
              value={labelInfo.legalForm ?? ''}
              onChange={(e) => patch({ legalForm: e.target.value.slice(0, 200) || undefined })}
              placeholder={t.setupLegalFormPlaceholder}
              maxLength={200}
            />
          </div>
          <EmailField
            id="label-identity-email"
            label={t.setupContactEmail}
            value={labelInfo.email ?? ''}
            onChange={(v) => patch({ email: v || undefined })}
            errorMessage={t.validationInvalidEmail}
          />
          <div className="space-y-2">
            <Label htmlFor="label-identity-sepa-holder">{t.setupSepaHolder}</Label>
            <Input
              id="label-identity-sepa-holder"
              value={labelInfo.sepaAccountHolder ?? ''}
              onChange={(e) =>
                patch({ sepaAccountHolder: e.target.value.slice(0, 140) || undefined })
              }
              placeholder={t.setupSepaHolderPlaceholder}
              maxLength={140}
            />
          </div>
          <IbanField
            id="label-identity-iban"
            label={t.setupSepaIban}
            value={labelInfo.sepaIban ?? ''}
            onChange={(v) => patch({ sepaIban: v || undefined })}
            errorMessage={t.validationInvalidIban}
            className="sm:col-span-2"
          />
        </div>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Buildings size={20} weight="bold" className="text-primary" />
          <h3 className="font-semibold">{t.setupLabelTitle}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{t.setupLabelDesc}</p>
        <Card className="p-6">{body}</Card>
      </div>
    )
  }

  return body
}
