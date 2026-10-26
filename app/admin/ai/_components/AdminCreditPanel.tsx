'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface Price { input_per_million_eur: number; output_per_million_eur: number; reasoning_per_million_eur?: number; free_tier_confirmed?: boolean }
interface Settings {
  enabled: boolean; buffer_percent: number
  artist_monthly: number; editor_monthly: number; admin_monthly: number
  model_prices: Record<string, Price>
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

export function AdminCreditPanel({ models }: { models: string[] }) {
  const [settings, setSettings] = useState<Settings | null>(null)
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
      if (!response.ok) throw new Error('Credit database unavailable. Apply supabase/reset.sql first.')
      const result = await response.json() as { settings: Settings; accounts: Account[]; summary: CostSummary; recent: Transaction[]; adjustments: Adjustment[] }
      setSettings(result.settings)
      setAccounts(result.accounts)
      setSummary(result.summary)
      setRecent(result.recent)
      setAdjustments(result.adjustments)
      setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load credits') }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!settings) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/ai/credits', {
        method: 'PATCH', headers: await headers(), body: JSON.stringify(settings),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Could not save credits')
      setSettings(data.settings as Settings)
      setNotice('Credit settings saved.')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save credits') }
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
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Credit adjustment failed')
      adjustmentRequestId.current = null
      await load()
      setNotice('Creditbuchung gespeichert.')
      setAdjustReason('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Credit adjustment failed') }
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
  return <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle>KI-Credits</CardTitle>
        <CardDescription>1 Credit = 0,001 € kalkulierte KI-Kosten. Credits werden pro Artist gemeinsam verwaltet. Preise in Euro je 1 Million Tokens. Bis zur Aktivierung gelten weiterhin die bisherigen Tokenlimits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {settings && <>
          <div className="flex items-center gap-3"><Switch id="credit-enabled" checked={settings.enabled}
            onCheckedChange={enabled => setSettings(old => old && ({ ...old, enabled }))} />
            <Label htmlFor="credit-enabled">Creditlimits aktivieren</Label></div>
          <div className="grid gap-3 sm:grid-cols-4">
            {numberField('artist_monthly', 'Artist pro Monat')}
            {numberField('editor_monthly', 'Editor pro Monat')}
            {numberField('admin_monthly', 'Admin pro Monat')}
            {numberField('buffer_percent', 'Puffer %')}
          </div>
          {Array.from(new Set(models.filter(Boolean))).map(model => {
            const p = settings.model_prices[model] ?? { input_per_million_eur: 0, output_per_million_eur: 0 }
            const change = (key: keyof Price, value: number) => setSettings(old => old && ({
              ...old, model_prices: { ...old.model_prices, [model]: { ...p, [key]: Math.max(0, value) } },
            }))
            return <div key={model} className="space-y-2 rounded-md border p-3">
              <p className="break-all text-sm font-medium">{model}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['input_per_million_eur','output_per_million_eur','reasoning_per_million_eur'] as const).map(key =>
                  <div key={key} className="space-y-1">
                    <Label>{key === 'input_per_million_eur' ? 'Input €/M' : key === 'output_per_million_eur' ? 'Output €/M' : 'Reasoning €/M (optional)'}</Label>
                    <Input type="number" min="0" step="0.001" value={p[key] ?? ''}
                      onChange={e => change(key, Number(e.target.value) || 0)} />
                  </div>)}
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={p.free_tier_confirmed === true}
                  onChange={e => setSettings(old => old && ({
                    ...old, model_prices: { ...old.model_prices, [model]: { ...p, free_tier_confirmed: e.target.checked } },
                  }))} />
                Nulltarif von diesem Anbieter/Konto ausdrücklich bestätigt
              </label>
            </div>
          })}
          <Button onClick={() => void save()} disabled={busy}>{busy ? 'Speichern…' : 'Credits speichern'}</Button>
        </>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>KI-Kosten im aktuellen Monat</CardTitle>
      <CardDescription>Providerkosten und interne Credits aus den tatsächlich abgeschlossenen Buchungen.</CardDescription>
    </CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap gap-6 text-sm">
        <div>Providerkosten: <strong>{Number(summary?.provider_cost_eur ?? 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 6 })}</strong></div>
        <div>Credits: <strong>{summary?.charged_credits ?? 0}</strong></div>
        <div>Abgerechnete Runden: <strong>{summary?.calls ?? 0}</strong></div>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm"><thead><tr><th className="p-2">Modell</th><th className="p-2">Kosten €</th><th className="p-2">Credits</th><th className="p-2">Runden</th></tr></thead>
          <tbody>{summary?.by_model.map(m => <tr key={m.model} className="border-t">
            <td className="break-all p-2">{m.model}</td><td className="p-2">{Number(m.provider_cost_eur).toFixed(6)}</td>
            <td className="p-2">{m.charged_credits}</td><td className="p-2">{m.calls}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Letzte Creditbuchungen</CardTitle>
      <CardDescription>Die letzten 30 Reservierungen mit ihren tatsächlichen Providerkosten und berechneten Credits.</CardDescription>
    </CardHeader><CardContent className="overflow-auto">
      <table className="w-full text-left text-sm"><thead><tr><th className="p-2">Zeit</th><th className="p-2">Konto</th><th className="p-2">Modell</th><th className="p-2">Credits</th><th className="p-2">Kosten €</th></tr></thead>
        <tbody>{recent.map(row => <tr key={row.request_id} className="border-t">
          <td className="whitespace-nowrap p-2">{new Date(row.created_at).toLocaleString('de-DE')}</td>
          <td className="p-2">{row.scope}: {row.scope_id}</td>
          <td className="break-all p-2">{row.model}</td>
          <td className="p-2">{row.refunded_at ? `0 (erstattet: ${row.original_charged_credits ?? 0})` : row.settled_at ? row.charged_credits : 'reserviert'}</td>
          <td className="p-2">{row.provider_cost_eur === null ? '–' : Number(row.provider_cost_eur).toFixed(6)}</td>
        </tr>)}</tbody>
      </table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Credits manuell anpassen</CardTitle>
      <CardDescription>Gutschriften und Korrekturen gelten für den laufenden UTC-Monat und werden mit Grund und Admin-ID protokolliert.</CardDescription>
    </CardHeader><CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1"><Label>Kontotyp</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={adjustScope} onChange={e => { setAdjustScope(e.target.value as 'artist' | 'editor' | 'admin'); adjustmentRequestId.current = null }}>
            <option value="artist">Artist</option><option value="editor">Editor</option><option value="admin">Label / Admin</option>
          </select></div>
        <div className="space-y-1"><Label>Artist- oder Nutzer-ID</Label>
          <Input value={adjustScope === 'admin' ? 'label' : adjustId}
            disabled={adjustScope === 'admin'} placeholder="UUID" onChange={e => { setAdjustId(e.target.value); adjustmentRequestId.current = null }} /></div>
        <div className="space-y-1"><Label>Credits (+/-)</Label>
          <Input type="number" step="1" value={adjustDelta} onChange={e => { setAdjustDelta(e.target.value); adjustmentRequestId.current = null }} /></div>
        <div className="space-y-1"><Label>Begründung</Label>
          <Input value={adjustReason} maxLength={500} onChange={e => { setAdjustReason(e.target.value); adjustmentRequestId.current = null }} /></div>
      </div>
      <Button disabled={busy || adjustReason.trim().length < 3 || Number(adjustDelta) === 0}
        onClick={() => void submitAdjustment()}>Creditbuchung speichern</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Letzte Admin-Korrekturen</CardTitle></CardHeader>
      <CardContent className="overflow-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Datum</th><th className="p-2">Konto</th><th className="p-2">Credits</th><th className="p-2">Grund</th></tr></thead>
        <tbody>{adjustments.map(a => <tr key={a.id} className="border-t">
          <td className="whitespace-nowrap p-2">{new Date(a.created_at).toLocaleString('de-DE')}</td>
          <td className="p-2">{a.scope}: {a.scope_id}</td><td className="p-2">{a.delta_credits > 0 ? '+' : ''}{a.delta_credits}</td>
          <td className="p-2">{a.reason}</td>
        </tr>)}</tbody>
      </table></CardContent></Card>
    <Card><CardHeader><CardTitle>Creditkonten</CardTitle>
      <CardDescription>Verbrauch inklusive laufender Reservierungen. Die Auswertung basiert auf Kontosalden und ist nicht auf 5.000 Events beschränkt.</CardDescription>
    </CardHeader><CardContent>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">Konto</th><th className="p-2">Monat</th><th className="p-2">Verbraucht</th><th className="p-2">Reserviert</th><th className="p-2">Verfügbar</th></tr></thead>
          <tbody>{accounts.map(a => <tr key={a.scope + a.scope_id + a.period_start} className="border-t">
            <td className="p-2"><button type="button" className="text-left underline-offset-2 hover:underline"
            title="Konto für Creditkorrektur auswählen"
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
