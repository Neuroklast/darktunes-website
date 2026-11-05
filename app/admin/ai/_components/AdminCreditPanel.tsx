'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useLocale, useTranslations } from 'next-intl'

interface Price { input_per_million_eur: number; output_per_million_eur: number; reasoning_per_million_eur?: number; free_tier_confirmed?: boolean }
interface Settings {
  enabled: boolean; buffer_percent: number
  artist_monthly: number; editor_monthly: number; admin_monthly: number
  model_prices: Record<string, Price>
}
/** Keep database-only fields out of the strict PATCH contract, including nested tariffs. */
function creditSettingsPayload(settings: Settings): Settings {
  return {
    enabled: settings.enabled,
    buffer_percent: settings.buffer_percent,
    artist_monthly: settings.artist_monthly,
    editor_monthly: settings.editor_monthly,
    admin_monthly: settings.admin_monthly,
    model_prices: Object.fromEntries(Object.entries(settings.model_prices).map(([model, price]) => [
      model,
      {
        input_per_million_eur: price.input_per_million_eur,
        output_per_million_eur: price.output_per_million_eur,
        ...(price.reasoning_per_million_eur !== undefined
          ? { reasoning_per_million_eur: price.reasoning_per_million_eur } : {}),
        ...(price.free_tier_confirmed !== undefined
          ? { free_tier_confirmed: price.free_tier_confirmed } : {}),
      },
    ])),
  }
}

interface CostSummary {
  provider_cost_eur: number
  charged_credits: number
  calls: number
  by_model: Array<{ model: string; provider_cost_eur: number; charged_credits: number; calls: number }>
}
interface Transaction { request_id: string; model: string; scope: string; scope_id: string; charged_credits: number | null; original_charged_credits: number | null; refunded_at: string | null; provider_cost_eur: number | null; created_at: string; settled_at: string | null }
interface Adjustment { id: string; actor_id: string; scope: string; scope_id: string; delta_credits: number; reason: string; created_at: string }
interface Account { scope: string; scope_id: string; period_start: string; monthly_allowance: number; used_credits: number; reserved_credits: number }
async function headers() {
  const { data } = await createBrowserSupabaseClient().auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export function AdminCreditPanel({ models, availableModels = [] }: { models: string[]; availableModels?: Array<{ id: string; name: string }> }) {
  const t = useTranslations('ai.admin.credits')
  const locale = useLocale()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [extraModel, setExtraModel] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [recent, setRecent] = useState<Transaction[]>([])
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [adjustScope, setAdjustScope] = useState<'artist' | 'editor' | 'admin'>('artist')
  const [adjustId, setAdjustId] = useState('')
  const [adjustDelta, setAdjustDelta] = useState('100')
  const [adjustReason, setAdjustReason] = useState('')
  const adjustmentRequestId = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/ai/credits', { headers: await headers(), cache: 'no-store' })
      if (!response.ok) throw new Error(t('databaseUnavailable'))
      const result = await response.json() as { settings: Settings; accounts: Account[]; summary: CostSummary; recent: Transaction[]; adjustments: Adjustment[] }
      setSettings(result.settings)
      setAccounts(result.accounts)
      setSummary(result.summary)
      setRecent(result.recent)
      setAdjustments(result.adjustments)
      setError('')
    } catch (err) { setError(err instanceof Error ? err.message : t('loadFailed')) }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!settings) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/ai/credits', {
        method: 'PATCH', headers: await headers(), body: JSON.stringify(creditSettingsPayload(settings)),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? data.error ?? t('settingsFailed'))
      setSettings(data.settings as Settings)
      setNotice(t('settingsSaved'))
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : t('settingsFailed')) }
    finally { setBusy(false) }
  }
  const submitAdjustment = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const id = adjustmentRequestId.current ?? crypto.randomUUID()
      adjustmentRequestId.current = id
      const response = await fetch('/api/admin/ai/credits/adjustments', {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ id, scope: adjustScope,
          scope_id: adjustScope === 'admin' ? 'label' : adjustId.trim(),
          delta_credits: Number(adjustDelta), reason: adjustReason.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? data.error ?? t('adjustmentFailed'))
      adjustmentRequestId.current = null
      await load()
      setNotice(t('adjustmentSaved'))
      setAdjustReason('')
    } catch (err) { setError(err instanceof Error ? err.message : t('adjustmentFailed')) }
    finally { setBusy(false) }
  }

  function numberField(field: 'artist_monthly' | 'editor_monthly' | 'admin_monthly' | 'buffer_percent', label: string) {
    return <div className="space-y-1" key={field}>
      <Label htmlFor={field}>{label}</Label>
      <Input id={field} type="number" min={0} step={1} max={field === 'buffer_percent' ? 100 : undefined}
        value={settings?.[field] ?? 0}
        onChange={e => setSettings(old => old && ({ ...old, [field]: Math.max(0, Number(e.target.value) || 0) }))} />
    </div>
  }
  const tariffModels = Array.from(new Set([...models.filter(Boolean), ...Object.keys(settings?.model_prices ?? {}), extraModel].filter(Boolean)))
  return <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {settings && <>
          <div className="flex items-center gap-3"><Switch id="credit-enabled" checked={settings.enabled}
            onCheckedChange={enabled => setSettings(old => old && ({ ...old, enabled }))} />
            <Label htmlFor="credit-enabled">{t("enableLimits")}</Label></div>
          <div className="grid gap-3 sm:grid-cols-4">
            {numberField('artist_monthly', t('artistPerMonth'))}
            {numberField('editor_monthly', t('editorPerMonth'))}
            {numberField('admin_monthly', t('adminPerMonth'))}
            {numberField('buffer_percent', t('bufferPercent'))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="credit-extra-model">{t("extraModel")}</Label>
            <select id="credit-extra-model" value={extraModel} onChange={e => {
              const selectedModel = e.target.value
              setExtraModel(selectedModel)
              if (selectedModel) {
                setSettings(old => old && ({
                  ...old,
                  model_prices: {
                    ...old.model_prices,
                    [selectedModel]: old.model_prices[selectedModel] ?? {
                      input_per_million_eur: 0, output_per_million_eur: 0,
                    },
                  },
                }))
              }
            }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t("selectModel")}</option>
              {availableModels.filter(m => !tariffModels.includes(m.id) || m.id === extraModel).map(m =>
                <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {tariffModels.map(model => {
            const p: Price = settings.model_prices[model] ?? { input_per_million_eur: 0, output_per_million_eur: 0 }
            const change = (key: keyof Price, value: number) => setSettings(old => old && ({
              ...old, model_prices: { ...old.model_prices, [model]: { ...p, [key]: Math.max(0, value) } },
            }))
            return <div key={model} className="space-y-2 rounded-md border p-3">
              <p className="break-all text-sm font-medium">{model}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['input_per_million_eur','output_per_million_eur','reasoning_per_million_eur'] as const).map(key =>
                  <div key={key} className="space-y-1">
                    <Label>{key === 'input_per_million_eur' ? t('inputPerMillion') : key === 'output_per_million_eur' ? t('outputPerMillion') : t('reasoningPerMillion')}</Label>
                    <Input type="number" min="0" step="0.001" value={p[key] ?? ''}
                      onChange={e => change(key, Number(e.target.value) || 0)} />
                  </div>)}
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={p.free_tier_confirmed === true}
                  onChange={e => setSettings(old => old && ({
                    ...old, model_prices: { ...old.model_prices, [model]: { ...p, free_tier_confirmed: e.target.checked } },
                  }))} />
                {t('freeTierConfirmed')}
              </label>
            </div>
          })}
          <Button onClick={() => void save()} disabled={busy}>{busy ? t('saving') : t('saveSettings')}</Button>
        </>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>{t('costTitle')}</CardTitle>
      <CardDescription>{t('costDescription')}</CardDescription>
    </CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap gap-6 text-sm">
        <div>{t('providerCosts')}: <strong>{Number(summary?.provider_cost_eur ?? 0).toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 6 })}</strong></div>
        <div>{t('credits')}: <strong>{summary?.charged_credits ?? 0}</strong></div>
        <div>{t('billedCalls')}: <strong>{summary?.calls ?? 0}</strong></div>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm"><thead><tr><th className="p-2">{t('model')}</th><th className="p-2">{t('costsEur')}</th><th className="p-2">{t('credits')}</th><th className="p-2">{t('calls')}</th></tr></thead>
          <tbody>{summary?.by_model.map(m => <tr key={m.model} className="border-t">
            <td className="break-all p-2">{m.model}</td><td className="p-2">{Number(m.provider_cost_eur).toFixed(6)}</td>
            <td className="p-2">{m.charged_credits}</td><td className="p-2">{m.calls}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("recentTitle")}</CardTitle>
      <CardDescription>{t('recentDescription')}</CardDescription>
    </CardHeader><CardContent className="overflow-auto">
      <table className="w-full text-left text-sm"><thead><tr><th className="p-2">{t('time')}</th><th className="p-2">{t('account')}</th><th className="p-2">{t('model')}</th><th className="p-2">{t('credits')}</th><th className="p-2">{t('costsEur')}</th></tr></thead>
        <tbody>{recent.map(row => <tr key={row.request_id} className="border-t">
          <td className="whitespace-nowrap p-2">{new Date(row.created_at).toLocaleString(locale)}</td>
          <td className="p-2">{row.scope}: {row.scope_id}</td>
          <td className="break-all p-2">{row.model}</td>
          <td className="p-2">{row.refunded_at ? `0 (${t('refunded', { count: row.original_charged_credits ?? 0 })})` : row.settled_at ? row.charged_credits  : t('reserved')}</td>
          <td className="p-2">{row.provider_cost_eur === null ? '–' : Number(row.provider_cost_eur).toFixed(6)}</td>
        </tr>)}</tbody>
      </table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('adjustTitle')}</CardTitle>
      <CardDescription>{t('adjustDescription')}</CardDescription>
    </CardHeader><CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1"><Label>{t('accountType')}</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={adjustScope} onChange={e => { setAdjustScope(e.target.value as 'artist' | 'editor' | 'admin'); adjustmentRequestId.current = null }}>
            <option value="artist">{t("scopeArtist")}</option><option value="editor">{t("scopeEditor")}</option><option value="admin">{t("scopeAdmin")}</option>
          </select></div>
        <div className="space-y-1"><Label>{t('artistOrUserId')}</Label>
          <Input value={adjustScope === 'admin' ? 'label' : adjustId}
            disabled={adjustScope === 'admin'} placeholder="UUID" onChange={e => { setAdjustId(e.target.value); adjustmentRequestId.current = null }} /></div>
        <div className="space-y-1"><Label>Credits (+/-)</Label>
          <Input type="number" step="1" value={adjustDelta} onChange={e => { setAdjustDelta(e.target.value); adjustmentRequestId.current = null }} /></div>
        <div className="space-y-1"><Label>{t('reason')}</Label>
          <Input value={adjustReason} maxLength={500} onChange={e => { setAdjustReason(e.target.value); adjustmentRequestId.current = null }} /></div>
      </div>
      <Button disabled={busy || adjustReason.trim().length < 3 || Number(adjustDelta) === 0}
        onClick={() => void submitAdjustment()}>{t('saveAdjustment')}</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('recentAdjustments')}</CardTitle></CardHeader>
      <CardContent className="overflow-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('account')}</th><th className="p-2">{t('credits')}</th><th className="p-2">{t('reason')}</th></tr></thead>
        <tbody>{adjustments.map(a => <tr key={a.id} className="border-t">
          <td className="whitespace-nowrap p-2">{new Date(a.created_at).toLocaleString(locale)}</td>
          <td className="p-2">{a.scope}: {a.scope_id}</td><td className="p-2">{a.delta_credits > 0 ? '+' : ''}{a.delta_credits}</td>
          <td className="p-2">{a.reason}</td>
        </tr>)}</tbody>
      </table></CardContent></Card>
    <Card><CardHeader><CardTitle>{t('accountsTitle')}</CardTitle>
      <CardDescription>{t('accountsDescription')}</CardDescription>
    </CardHeader><CardContent>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">{t('account')}</th><th className="p-2">{t('month')}</th><th className="p-2">{t('used')}</th><th className="p-2">{t('reserved')}</th><th className="p-2">{t('available')}</th></tr></thead>
          <tbody>{accounts.map(a => <tr key={a.scope + a.scope_id + a.period_start} className="border-t">
            <td className="p-2"><button type="button" className="text-left underline-offset-2 hover:underline"
            title={t('selectAccountForAdjustment')}
            onClick={() => { setAdjustScope(a.scope as 'artist' | 'editor' | 'admin'); setAdjustId(a.scope_id); adjustmentRequestId.current = null }}>
            {a.scope}: {a.scope_id}</button></td><td className="p-2">{a.period_start.slice(0,7)}</td>
            <td className="p-2">{a.used_credits}</td><td className="p-2">{a.reserved_credits}</td>
            <td className="p-2">{Math.max(0, a.monthly_allowance-a.used_credits-a.reserved_credits)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </CardContent></Card>
  </div>
}
