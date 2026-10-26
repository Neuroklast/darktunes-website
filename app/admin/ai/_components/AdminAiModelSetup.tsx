'use client'

import { useMemo, useState } from 'react'
import { ArrowSquareOut, CheckCircle, ShieldWarning, Lightning, Brain, Key } from '@phosphor-icons/react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface AdminModelOption {
  id: string
  name: string
  model: string
  provider: string
  provider_name: string
  roles: Array<'fast' | 'reasoning'>
  configured: boolean
  verified: boolean
  freeTier: string
  description: string
}
export interface AdminProviderOption {
  provider: string
  name: string
  configured: boolean
  accountReady: boolean
  docs: string
  free_tier: string
}

interface Props {
  models: AdminModelOption[]
  providers: AdminProviderOption[]
  fast: string
  reasoning: string
  fallback: string
  saving: boolean
  testing: boolean
  onChange: (slot: 'fast' | 'reasoning' | 'fallback', id: string) => void
  onSave: () => void
  onTest: (id: string) => void
  onRefresh: () => void
}

function modelStatus(model?: AdminModelOption) {
  if (!model?.configured) return { label: 'API-Key fehlt', cls: 'text-amber-500' }
  if (!model?.verified) return { label: 'Test erforderlich', cls: 'text-amber-500' }
  return { label: 'Agententest bestanden', cls: 'text-emerald-500' }
}

export function AdminAiModelSetup({
  models, providers, fast, reasoning, fallback, saving, testing,
  onChange, onSave, onTest, onRefresh,
}: Props) {
  const [providerFilter, setProviderFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'fast' | 'reasoning'>('all')
  const filtered = useMemo(() => models.filter(model =>
    (providerFilter === 'all' || model.provider === providerFilter) &&
    (modeFilter === 'all' || model.roles.includes(modeFilter)) &&
    (`${model.name} ${model.description} ${model.provider_name}`
      .toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  ), [models, search, providerFilter, modeFilter])

  const selected = [fast, reasoning, ...(fallback ? [fallback] : [])]
  const missing = selected.filter(id => !models.find(model => model.id === id)?.configured)
  const notTested = selected.filter(id => !models.find(model => model.id === id)?.verified)

  function selector(slot: 'fast' | 'reasoning' | 'fallback', title: string, subtitle: string) {
    const value = slot === 'fast' ? fast : slot === 'reasoning' ? reasoning : fallback
    const entry = models.find(model => model.id === value)
    const suitable = models.filter(model => slot === 'fallback' ? model.roles.includes('fast') :
      model.roles.includes(slot))
    const status = modelStatus(entry)
    return <div key={slot} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2">{slot === 'reasoning' ? <Brain className="h-5 w-5" /> : <Lightning className="h-5 w-5" />}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Select value={value || '__none__'} onValueChange={id => onChange(slot, id === '__none__' ? '' : id)}>
        <SelectTrigger aria-label={title} className="w-full">
          <SelectValue placeholder="Modell auswählen" />
        </SelectTrigger>
        <SelectContent>
          {slot === 'fallback' && <SelectItem value="__none__">Kein Fallback</SelectItem>}
          {suitable.map(model =>
            <SelectItem key={model.id} value={model.id}>
              {model.provider_name} · {model.name.replace(` (${model.model})`, '')}
            </SelectItem>,
          )}
        </SelectContent>
      </Select>
      {entry && <>
        <p className="break-all font-mono text-[11px] text-muted-foreground">{entry.model}</p>
        <div className={cn('flex items-center gap-1.5 text-xs', status.cls)}>
          {entry.verified ? <CheckCircle className="h-4 w-4" /> : <ShieldWarning className="h-4 w-4" />}
          {status.label}
        </div>
        <Button variant="outline" size="sm" disabled={testing || !entry.configured}
          onClick={() => onTest(entry.id)}>Chat + Streaming + Tools testen</Button>
      </>}
    </div>
  }

  return <div className="space-y-5">
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Agentenprofile</CardTitle>
        <CardDescription>
          Ordne je Aufgabe ein geeignetes Chatmodell zu. Wechsel zwischen Anbietern erfolgen
          über die Modellzuordnung, nicht über einen globalen NVIDIA-Schalter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {selector('fast', 'Schneller Chat', 'Alltag, kurze Fragen und einfache Tools')}
          {selector('reasoning', 'Ausführlicher Chat', 'Planung, Analysen und komplexe Aufgaben')}
          {selector('fallback', 'Fallback', 'Nur nach bestandenem Test; kein stiller Tarifwechsel')}
        </div>
        {missing.length > 0 && <p className="text-sm text-amber-500">
          Für {missing.length} ausgewählte Modelle fehlt noch der Anbieterzugang.
          <Link href="/admin/api-keys" className="ml-1 underline">API-Keys verwalten</Link>
        </p>}
        {notTested.length > 0 && <p className="text-xs text-muted-foreground">
          Modelle anderer Anbieter benötigen vor dem Live-Einsatz einen erfolgreichen
          Chat-, Streaming- und Tool-Test. Jeder Test stellt echte API-Anfragen.
        </p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={saving} onClick={onSave}>{saving ? 'Speichern…' : 'Modellprofile speichern'}</Button>
          <Button variant="outline" onClick={onRefresh}>Katalog aktualisieren</Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Anbieter & API-Zugänge</CardTitle>
        <CardDescription>
          Zugangsdaten sind zentral in der verschlüsselten API-Pflege hinterlegt.
          Ein Free-Tier ist konten- und modellabhängig und keine Kostengarantie. Vor Nutzung mit Künstler- und Personendaten sind Datenschutzbedingungen und möglicher Datentransfer in Drittländer zu prüfen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map(item => <div key={item.provider} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.name}</h3>
              <Badge variant="outline">{item.configured && item.accountReady ? 'Bereit' : 'Einrichtung fehlt'}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.accountReady ? 'Endpunkt konfiguriert' : 'Zusätzliche Konto-ID benötigt'}
              {' · '}Kostenloses Kontingent ggf. verfügbar
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <Link href="/admin/api-keys" className="inline-flex items-center gap-1 underline underline-offset-2">
                <Key className="h-3.5 w-3.5" /> API-Key
              </Link>
              <a href={item.docs} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2">
                Dokumentation <ArrowSquareOut className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>)}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Geprüfter Chat-Modellkatalog</CardTitle>
        <CardDescription>Nur kuratierte Text-Chatmodelle; keine Bild-, Video-, Audio- oder Embedding-Endpunkte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Modell suchen</Label>
            <Input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Name, Anbieter oder Modell-ID" />
          </div>
          <div className="space-y-1">
            <Label>Anbieter</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={providerFilter} onChange={event => setProviderFilter(event.target.value)}>
              <option value="all">Alle Anbieter</option>
              {providers.map(item => <option key={item.provider} value={item.provider}>{item.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Aufgabe</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={modeFilter} onChange={event => setModeFilter(event.target.value as typeof modeFilter)}>
              <option value="all">Alle Chatmodelle</option><option value="fast">Schnell</option>
              <option value="reasoning">Ausführlich</option>
            </select>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(model => {
            const active = selected.includes(model.id)
            return <div key={model.id} className={cn('rounded-lg border p-3', active && 'border-primary/60 bg-primary/5')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{model.name.replace(` (${model.model})`, '')}</p>
                  <p className="text-xs text-muted-foreground">{model.provider_name}</p>
                </div>
                {active && <Badge>Aktiv</Badge>}
              </div>
              <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{model.model}</p>
              <p className="mt-2 text-xs">{model.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {model.roles.map(role => <Badge key={role} variant="outline">{role === 'fast' ? 'Schnell' : 'Ausführlich'}</Badge>)}
                <Badge variant="outline">{model.verified ? 'Getestet' : 'Ungetestet'}</Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" disabled={!model.configured || testing}
                  onClick={() => onTest(model.id)}>Test</Button>
              </div>
            </div>
          })}
        </div>
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">Keine passenden Chatmodelle.</p>}
      </CardContent>
    </Card>
  </div>
}
