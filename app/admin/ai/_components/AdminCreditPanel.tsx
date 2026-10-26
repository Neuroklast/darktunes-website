'use client'

import { useCallback, useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface Price { input_per_million_eur: number; output_per_million_eur: number; reasoning_per_million_eur?: number }
interface Settings {
  enabled: boolean; buffer_percent: number
  artist_monthly: number; editor_monthly: number; admin_monthly: number
  model_prices: Record<string, Price>
}
interface Account { scope: string; scope_id: string; period_start: string; monthly_allowance: number; used_credits: number; reserved_credits: number }
async function headers() {
  const { data } = await createBrowserSupabaseClient().auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export function AdminCreditPanel({ models }: { models: string[] }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/ai/credits', { headers: await headers(), cache: 'no-store' })
      if (!response.ok) throw new Error('Credit database unavailable. Apply supabase/reset.sql first.')
      const result = await response.json() as { settings: Settings; accounts: Account[] }
      setSettings(result.settings)
      setAccounts(result.accounts)
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
            </div>
          })}
          <Button onClick={() => void save()} disabled={busy}>{busy ? 'Speichern…' : 'Credits speichern'}</Button>
        </>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>Creditkonten</CardTitle>
      <CardDescription>Verbrauch inklusive laufender Reservierungen. Die Auswertung basiert auf Kontosalden und ist nicht auf 5.000 Events beschränkt.</CardDescription>
    </CardHeader><CardContent>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">Konto</th><th className="p-2">Monat</th><th className="p-2">Verbraucht</th><th className="p-2">Reserviert</th><th className="p-2">Verfügbar</th></tr></thead>
          <tbody>{accounts.map(a => <tr key={a.scope + a.scope_id + a.period_start} className="border-t">
            <td className="p-2">{a.scope}: {a.scope_id}</td><td className="p-2">{a.period_start.slice(0,7)}</td>
            <td className="p-2">{a.used_credits}</td><td className="p-2">{a.reserved_credits}</td>
            <td className="p-2">{Math.max(0, a.monthly_allowance-a.used_credits-a.reserved_credits)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </CardContent></Card>
  </div>
}
