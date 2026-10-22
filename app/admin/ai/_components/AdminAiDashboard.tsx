'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  Copy,
  Database,
  Gauge,
  Plugs,
  Robot,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getErrorMessage } from '@/lib/clientErrors'
import type { ApiErrorResponse } from '@/lib/errors'

interface SettingsPayload {
  enabled: boolean
  provider_configured: boolean
  test_mode: boolean
  provider: string
  model_fast: string
  model_reasoning: string
  fallback_model: string
  default_streaming: boolean
  token_limits: {
    fast: { max_input_tokens: number; max_output_tokens: number; max_turn_tokens: number }
    reasoning: {
      max_input_tokens: number
      max_output_tokens: number
      max_turn_tokens: number
      max_reasoning_tokens: number
    }
  }
  max_tool_rounds: number
  feature_flags: Record<string, boolean>
  reasoning_settings: { fastDefault: boolean; reasoningDefault: boolean; lowEffort: boolean }
  timeouts: { completeMs: number; streamMs: number; reasoningMs: number }
  provider_capabilities: Record<string, unknown>
  last_connection_test: ConnectionTestResult | null
  last_successful_connection_test: ConnectionTestResult | null
  last_failed_connection_test: ConnectionTestResult | null
  updated_at: string
}

interface ConnectionTestStep {
  id: string
  step: string
  model: string | null
  ok: boolean
  status: 'passed' | 'failed' | 'timed_out' | 'unavailable' | 'not_tested' | 'skipped'
  latency_ms: number
  http_status: number | null
  error_code: string | null
  detail: string | null
  technical: Record<string, unknown> | null
}

interface ConnectionTestResult {
  ok: boolean
  integration_ok: boolean
  scope: 'fast' | 'reasoning' | 'all'
  started_at: string
  finished_at: string
  total_latency_ms: number
  steps: ConnectionTestStep[]
}

interface ModelHealth {
  ok: boolean
  tested_at: string | null
  supports_streaming: boolean
  supports_tools: boolean
  supports_enable_thinking: boolean
  supports_low_effort: boolean
}

interface ModelsPayload {
  models: Array<{ id: string; name: string }>
  configured: { fast: string; reasoning: string; fallback: string | null }
  capabilities: Record<string, Record<string, unknown>>
  health: Record<string, ModelHealth>
  last_connection_test: ConnectionTestResult | null
  last_successful_connection_test: ConnectionTestResult | null
  last_failed_connection_test: ConnectionTestResult | null
}

interface UsagePayload {
  today_tokens: number
  month_tokens: number
  today: { input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; calls: number; failed: number }
  month: { input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; calls: number; failed: number }
  by_model: Array<{ model: string; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; calls: number; failures: number }>
  by_role: Array<{ role: string; total_tokens: number; calls: number }>
  by_day: Array<{ date: string; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; failures: number }>
  budget: {
    global_day: { token_limit: number; used_tokens: number; reserved_tokens: number }
    global_month: { token_limit: number; used_tokens: number; reserved_tokens: number }
    user_day: { token_limit: number; used_tokens: number; reserved_tokens: number }
    user_month: { token_limit: number; used_tokens: number; reserved_tokens: number }
  }
  failures: { count: number; by_code: Array<{ code: string; count: number }> }
  truncated: boolean
}

interface DiagnosticItem {
  id: string
  source: string
  request_id: string
  user_id: string
  artist_id: string | null
  conversation_id: string | null
  model: string
  success: boolean
  error_code: string | null
  created_at: string
  tokens: { input: number; output: number; reasoning: number; total: number }
  latency_ms: number | null
  ttft_ms: number | null
  rounds: number
  tool_failures: number
  technical: Record<string, unknown>
}

interface DiagnosticsPayload {
  items: DiagnosticItem[]
  next_cursor: string | null
  repeated: Array<{ error_code: string; model: string; count: number }>
  saved_analyses: Array<{
    id: string
    error_reference: string
    classification: string | null
    analysis_status: string
    created_at: string
  }>
}

interface LoadError {
  code: string
  message: string
}

async function authHeaders(): Promise<Headers> {
  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase.auth.getSession()
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  return headers
}

export function AdminAiDashboard() {
  const t = useTranslations('ai')
  const tErrors = useTranslations('errors')
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [modelsData, setModelsData] = useState<ModelsPayload | null>(null)
  const [usage, setUsage] = useState<UsagePayload | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<string, LoadError | null>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<'fast' | 'reasoning' | 'all' | null>(null)
  const [lastResult, setLastResult] = useState<ConnectionTestResult | null>(null)
  const [diagSince, setDiagSince] = useState('7d')
  const [diagStatus, setDiagStatus] = useState('failed')
  const [diagModel, setDiagModel] = useState('')
  const [diagCode, setDiagCode] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const headers = await authHeaders()
    const [settingsRes, modelsRes, usageRes, diagRes] = await Promise.all([
      fetch('/api/admin/ai/settings', { headers, cache: 'no-store' }),
      fetch('/api/admin/ai/models', { headers, cache: 'no-store' }),
      fetch('/api/admin/ai/usage', { headers, cache: 'no-store' }),
      fetch('/api/admin/ai/diagnostics?since=7d', { headers, cache: 'no-store' }),
    ])
    const nextErrors: Record<string, LoadError | null> = {}
    if (settingsRes.ok) {
      setSettings((await settingsRes.json()) as SettingsPayload)
      nextErrors.settings = null
    } else {
      nextErrors.settings = await readError(settingsRes, tErrors)
    }
    if (modelsRes.ok) {
      setModelsData((await modelsRes.json()) as ModelsPayload)
      nextErrors.models = null
    } else {
      nextErrors.models = await readError(modelsRes, tErrors)
      setModelsData(null)
    }
    if (usageRes.ok) {
      setUsage((await usageRes.json()) as UsagePayload)
      nextErrors.usage = null
    } else {
      nextErrors.usage = await readError(usageRes, tErrors)
    }
    if (diagRes.ok) {
      setDiagnostics((await diagRes.json()) as DiagnosticsPayload)
      nextErrors.diagnostics = null
    } else {
      nextErrors.diagnostics = await readError(diagRes, tErrors)
    }
    setErrors(nextErrors)
    setLoading(false)
  }, [tErrors])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ai/settings', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({
          enabled: settings.enabled,
          test_mode: settings.test_mode,
          default_streaming: settings.default_streaming,
          model_fast: settings.model_fast,
          model_reasoning: settings.model_reasoning,
          fallback_model: settings.fallback_model,
          max_tool_rounds: settings.max_tool_rounds,
          feature_flags: settings.feature_flags,
          reasoning_settings: {
            fast_default: settings.reasoning_settings.fastDefault,
            reasoning_default: settings.reasoning_settings.reasoningDefault,
            low_effort: settings.reasoning_settings.lowEffort,
          },
          timeouts: {
            complete_ms: settings.timeouts.completeMs,
            stream_ms: settings.timeouts.streamMs,
            reasoning_ms: settings.timeouts.reasoningMs,
          },
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      setSettings((await res.json()) as SettingsPayload)
      toast.success(t('settingsSaved'))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors('SERVER_ERROR'))
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async (scope: 'fast' | 'reasoning' | 'all') => {
    setTesting(scope)
    try {
      const res = await fetch('/api/admin/ai/connection-tests', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ scope }),
      })
      const body = (await res.json().catch(() => null)) as ConnectionTestResult | ApiErrorResponse | null
      if (!res.ok) {
        if (body && 'code' in body) throw new Error(getErrorMessage(body, tErrors))
        throw new Error(t('statusFailed'))
      }
      const result = body as ConnectionTestResult
      setLastResult(result)
      if (result.ok) toast.success(t('admin.healthAllPassed'))
      else {
        const failed = result.steps.find((step) => !step.ok && normalizeStepStatus(step) !== 'skipped')
        toast.error(
          failed
            ? t('admin.healthFailedStep', {
                step: failed.step,
                code: failed.error_code ?? failed.status,
              })
            : t('statusFailed'),
        )
      }
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tErrors('SERVER_ERROR'))
    } finally {
      setTesting(null)
    }
  }

  const refreshModels = async () => {
    try {
      const res = await fetch('/api/admin/ai/models?refresh=1', {
        headers: await authHeaders(),
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      setModelsData((await res.json()) as ModelsPayload)
      toast.success(t('refreshModels'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('modelsLoadFailed'))
    }
  }

  const loadDiagnostics = async () => {
    const params = new URLSearchParams({ since: diagSince, status: diagStatus })
    if (diagModel.trim()) params.set('model', diagModel.trim())
    if (diagCode.trim()) params.set('error_code', diagCode.trim())
    const res = await fetch(`/api/admin/ai/diagnostics?${params.toString()}`, {
      headers: await authHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) {
      setErrors((current) => ({ ...current, diagnostics: { code: 'SERVER_ERROR', message: t('admin.diagnosticsLoadFailed') } }))
      return
    }
    setDiagnostics((await res.json()) as DiagnosticsPayload)
    setErrors((current) => ({ ...current, diagnostics: null }))
  }

  const modelOptions = useMemo(() => {
    if (!modelsData || !settings) return []
    const ids = new Set<string>([
      settings.model_fast,
      settings.model_reasoning,
      settings.fallback_model,
      ...modelsData.models.map((model) => model.id),
    ])
    return [...ids]
      .filter(Boolean)
      .map((id) => ({
        value: id,
        label: modelsData.models.find((model) => model.id === id)?.name || id,
      }))
  }, [modelsData, settings])

  if (loading && !settings) {
    return <p className="text-sm text-muted-foreground">{t('loading')}</p>
  }

  if (!settings) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{errors.settings?.message ?? t('statusFailed')}</p>
        <Button type="button" onClick={() => void load()} variant="outline">
          <ArrowClockwise className="mr-1.5 h-4 w-4" aria-hidden />
          {t('retry')}
        </Button>
      </div>
    )
  }

  const activeTest = lastResult ?? settings.last_connection_test
  const verified = settings.last_successful_connection_test?.ok === true

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap">
        <TabsTrigger value="overview">{t('admin.overview')}</TabsTrigger>
        <TabsTrigger value="models">{t('tabModels')}</TabsTrigger>
        <TabsTrigger value="health">{t('tabHealth')}</TabsTrigger>
        <TabsTrigger value="usage">{t('tabTokens')}</TabsTrigger>
        <TabsTrigger value="diagnostics">{t('tabDiagnostics')}</TabsTrigger>
        <TabsTrigger value="settings">{t('tabGeneral')}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            title={t('admin.assistantStatus')}
            value={settings.enabled ? t('admin.enabled') : t('admin.disabled')}
            detail={
              settings.enabled
                ? settings.test_mode
                  ? t('testModeLabel')
                  : t('admin.liveMode')
                : t('disabled')
            }
            tone={settings.enabled ? 'ok' : 'muted'}
            icon={<Robot className="h-4 w-4" aria-hidden />}
          />
          <StatusCard
            title={t('admin.nvidiaConfig')}
            value={
              settings.provider_configured ? t('admin.configured') : t('admin.notConfigured')
            }
            detail={
              modelsData
                ? t('admin.keyAcceptedHint')
                : settings.provider_configured
                  ? t('admin.modelsUnavailable')
                  : t('admin.notConfiguredHint')
            }
            tone={settings.provider_configured ? 'warn' : 'error'}
            icon={<Plugs className="h-4 w-4" aria-hidden />}
          />
          <StatusCard
            title={t('admin.lastSuccess')}
            value={
              settings.last_successful_connection_test
                ? formatDate(settings.last_successful_connection_test.finished_at)
                : t('admin.never')
            }
            detail={
              settings.last_successful_connection_test
                ? t('admin.latency', {
                    ms: settings.last_successful_connection_test.total_latency_ms,
                  })
                : t('admin.runTestHint')
            }
            tone={settings.last_successful_connection_test ? 'ok' : 'warn'}
            icon={<CheckCircle className="h-4 w-4" aria-hidden />}
          />
          <StatusCard
            title={t('admin.lastFailure')}
            value={
              settings.last_failed_connection_test
                ? formatDate(settings.last_failed_connection_test.finished_at)
                : t('admin.never')
            }
            detail={
              settings.last_failed_connection_test
                ? firstFailure(settings.last_failed_connection_test)
                : t('admin.noFailure')
            }
            tone={settings.last_failed_connection_test ? 'error' : 'muted'}
            icon={<WarningCircle className="h-4 w-4" aria-hidden />}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title={t('admin.fastModel')}
            value={shortModel(settings.model_fast)}
            detail={settings.model_fast}
            icon={<Gauge className="h-4 w-4" aria-hidden />}
          />
          <MetricCard
            title={t('admin.reasoningModel')}
            value={shortModel(settings.model_reasoning)}
            detail={settings.model_reasoning}
            icon={<Database className="h-4 w-4" aria-hidden />}
          />
          <MetricCard
            title={t('admin.tokensToday')}
            value={formatNumber(usage?.today.total_tokens ?? 0)}
            detail={t('admin.failedCalls', { count: usage?.today.failed ?? 0 })}
            icon={<Clock className="h-4 w-4" aria-hidden />}
          />
          <MetricCard
            title={t('admin.tokensMonth')}
            value={formatNumber(usage?.month.total_tokens ?? 0)}
            detail={t('admin.failedCalls', { count: usage?.month.failed ?? 0 })}
            icon={<Clock className="h-4 w-4" aria-hidden />}
          />
        </div>

        {!verified ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-amber-100">{t('admin.unverifiedWarning')}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={testing !== null}
                onClick={() => void testConnection('all')}
              >
                {testing ? t('testing') : t('admin.runFullTest')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {errors.usage ? <ErrorLine message={errors.usage.message} /> : null}
        {errors.models ? <ErrorLine message={errors.models.message} /> : null}
      </TabsContent>

      <TabsContent value="models" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('tabModels')}</CardTitle>
            <CardDescription>{t('admin.modelsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ModelSelect
              label={t('fastModel')}
              value={settings.model_fast}
              options={modelOptions}
              onChange={(value) => setSettings({ ...settings, model_fast: value })}
            />
            <ModelSelect
              label={t('reasoningModel')}
              value={settings.model_reasoning}
              options={modelOptions}
              onChange={(value) => setSettings({ ...settings, model_reasoning: value })}
            />
            <ModelSelect
              label={t('admin.fallbackModel')}
              value={settings.fallback_model || '__none__'}
              options={[{ value: '__none__', label: t('admin.noFallback') }, ...modelOptions]}
              onChange={(value) =>
                setSettings({ ...settings, fallback_model: value === '__none__' ? '' : value })
              }
            />
            <p className="text-xs text-muted-foreground">{t('admin.fallbackHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? t('saving') : t('saveSettings')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void refreshModels()}>
                <ArrowClockwise className="mr-1.5 h-4 w-4" aria-hidden />
                {t('refreshModels')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          <ModelDetail
            title={t('fastModel')}
            model={settings.model_fast}
            health={modelsData?.health[settings.model_fast]}
            capabilities={modelsData?.capabilities[settings.model_fast]}
            limits={settings.token_limits.fast}
          />
          <ModelDetail
            title={t('reasoningModel')}
            model={settings.model_reasoning}
            health={modelsData?.health[settings.model_reasoning]}
            capabilities={modelsData?.capabilities[settings.model_reasoning]}
            limits={settings.token_limits.reasoning}
          />
        </div>
        {errors.models ? <ErrorLine message={errors.models.message} /> : null}
      </TabsContent>

      <TabsContent value="health" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('tabHealth')}</CardTitle>
            <CardDescription>{t('admin.healthDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={testing !== null}
                onClick={() => void testConnection('fast')}
              >
                {testing === 'fast' ? t('testing') : t('admin.testFast')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={testing !== null}
                onClick={() => void testConnection('reasoning')}
              >
                {testing === 'reasoning' ? t('testing') : t('admin.testReasoning')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={testing !== null}
                onClick={() => void testConnection('all')}
              >
                {testing === 'all' ? t('testing') : t('admin.runFullTest')}
              </Button>
            </div>
            {activeTest ? (
              <HealthTable steps={activeTest.steps} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('admin.noHealthYet')}</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="usage" className="space-y-4">
        <UsagePanel usage={usage} error={errors.usage} />
      </TabsContent>

      <TabsContent value="diagnostics" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('tabDiagnostics')}</CardTitle>
            <CardDescription>{t('admin.diagnosticsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('admin.since')}</Label>
                <Select value={diagSince} onValueChange={setDiagSince}>
                  <SelectTrigger className="h-9 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">{t('admin.last24h')}</SelectItem>
                    <SelectItem value="7d">{t('admin.last7d')}</SelectItem>
                    <SelectItem value="30d">{t('admin.last30d')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('admin.status')}</Label>
                <Select value={diagStatus} onValueChange={setDiagStatus}>
                  <SelectTrigger className="h-9 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="failed">{t('admin.failedOnly')}</SelectItem>
                    <SelectItem value="all">{t('admin.allCalls')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('admin.modelFilter')}</Label>
                <Input
                  value={diagModel}
                  onChange={(event) => setDiagModel(event.target.value)}
                  className="h-9 w-44 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('admin.errorCode')}</Label>
                <Input
                  value={diagCode}
                  onChange={(event) => setDiagCode(event.target.value)}
                  className="h-9 w-44 text-xs"
                />
              </div>
              <Button type="button" size="sm" onClick={() => void loadDiagnostics()}>
                {t('admin.applyFilters')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyDiagnostics(diagnostics, toast, t)}
                disabled={!diagnostics?.items.length}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {t('admin.copyReport')}
              </Button>
            </div>
            {errors.diagnostics ? <ErrorLine message={errors.diagnostics.message} /> : null}
            {diagnostics?.repeated.length ? (
              <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
                <p className="text-xs font-medium text-amber-100">{t('admin.repeatedFailures')}</p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {diagnostics.repeated.map((row) => (
                    <li key={`${row.error_code}-${row.model}`}>
                      {row.error_code} · {shortModel(row.model)} · {row.count}×
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <DiagnosticsTable items={diagnostics?.items ?? []} empty={t('noDiagnostics')} />
            {diagnostics?.saved_analyses.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t('admin.savedAnalyses')}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {diagnostics.saved_analyses.map((row) => (
                    <li key={row.id}>
                      {row.error_reference} · {row.classification ?? row.analysis_status} ·{' '}
                      {formatDate(row.created_at)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('tabGeneral')}</CardTitle>
            <CardDescription>{t('pageDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              id="ai-enabled"
              label={t('enableLabel')}
              checked={settings.enabled}
              onChange={(enabled) => setSettings({ ...settings, enabled })}
            />
            <ToggleRow
              id="ai-test-mode"
              label={t('testModeLabel')}
              checked={settings.test_mode}
              onChange={(test_mode) => setSettings({ ...settings, test_mode })}
            />
            <ToggleRow
              id="ai-streaming"
              label={t('streamingLabel')}
              checked={settings.default_streaming}
              onChange={(default_streaming) => setSettings({ ...settings, default_streaming })}
            />
            <ToggleRow
              id="ai-low-effort"
              label={t('admin.lowEffort')}
              checked={settings.reasoning_settings.lowEffort}
              onChange={(lowEffort) =>
                setSettings({
                  ...settings,
                  reasoning_settings: { ...settings.reasoning_settings, lowEffort },
                })
              }
            />
            <div className="grid gap-2 sm:grid-cols-3">
              {(['artist', 'editor', 'admin'] as const).map((role) => (
                <ToggleRow
                  key={role}
                  id={`ai-role-${role}`}
                  label={t(`admin.role_${role}`)}
                  checked={settings.feature_flags[role] !== false}
                  onChange={(enabled) =>
                    setSettings({
                      ...settings,
                      feature_flags: { ...settings.feature_flags, [role]: enabled },
                    })
                  }
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label={t('admin.completeTimeout')}
                value={settings.timeouts.completeMs}
                onChange={(completeMs) =>
                  setSettings({ ...settings, timeouts: { ...settings.timeouts, completeMs } })
                }
              />
              <NumberField
                label={t('admin.streamTimeout')}
                value={settings.timeouts.streamMs}
                onChange={(streamMs) =>
                  setSettings({ ...settings, timeouts: { ...settings.timeouts, streamMs } })
                }
              />
              <NumberField
                label={t('admin.reasoningTimeout')}
                value={settings.timeouts.reasoningMs}
                onChange={(reasoningMs) =>
                  setSettings({ ...settings, timeouts: { ...settings.timeouts, reasoningMs } })
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? t('saving') : t('saveSettings')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
                <ArrowClockwise className="mr-1.5 h-4 w-4" aria-hidden />
                {t('retry')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function StatusCard({
  title,
  value,
  detail,
  tone,
  icon,
}: {
  title: string
  value: string
  detail: string
  tone: 'ok' | 'warn' | 'error' | 'muted'
  icon: React.ReactNode
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </CardTitle>
          <span
            className={
              tone === 'ok'
                ? 'text-emerald-500'
                : tone === 'warn'
                  ? 'text-amber-400'
                  : tone === 'error'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
            }
          >
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-sm font-semibold text-foreground">{value}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string
  value: string
  detail: string
  icon: React.ReactNode
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </CardTitle>
          <span className="text-muted-foreground">{icon}</span>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <p className="truncate text-lg font-semibold tabular-nums text-foreground" title={detail}>
          {value}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={detail}>
          {detail}
        </p>
      </CardContent>
    </Card>
  )
}

function ModelSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={options.length === 0}>
        <SelectTrigger className="w-full max-w-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ModelDetail({
  title,
  model,
  health,
  capabilities,
  limits,
}: {
  title: string
  model: string
  health?: ModelHealth
  capabilities?: Record<string, unknown>
  limits: { max_input_tokens: number; max_output_tokens: number; max_turn_tokens: number }
}) {
  const t = useTranslations('ai')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="break-all font-mono text-xs">{model}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-1.5">
          <CapabilityBadge label={t('admin.streaming')} value={health?.supports_streaming ?? capabilities?.supports_streaming} />
          <CapabilityBadge label={t('admin.tools')} value={health?.supports_tools ?? capabilities?.supports_tools} />
          <CapabilityBadge
            label={t('admin.reasoning')}
            value={health?.supports_enable_thinking ?? capabilities?.supports_enable_thinking}
          />
          <CapabilityBadge
            label={t('admin.lowEffort')}
            value={health?.supports_low_effort ?? capabilities?.supports_low_effort}
          />
        </div>
        <p className="text-muted-foreground">
          {t('admin.limits', {
            input: limits.max_input_tokens,
            output: limits.max_output_tokens,
            turn: limits.max_turn_tokens,
          })}
        </p>
        <p className="text-muted-foreground">
          {health
            ? health.ok
              ? t('admin.lastTestPassed', { date: formatDate(health.tested_at) })
              : t('admin.lastTestFailed', { date: formatDate(health.tested_at) })
            : t('admin.notTested')}
        </p>
      </CardContent>
    </Card>
  )
}

function CapabilityBadge({ label, value }: { label: string; value: unknown }) {
  const t = useTranslations('ai')
  const state = value === true ? 'ok' : value === false ? 'no' : 'unknown'
  return (
    <Badge
      variant="outline"
      className={
        state === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : state === 'no'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'text-muted-foreground'
      }
    >
      {label}: {state === 'ok' ? t('admin.tested') : state === 'no' ? t('admin.unsupported') : t('admin.notTested')}
    </Badge>
  )
}

function HealthTable({ steps }: { steps: ConnectionTestStep[] }) {
  const t = useTranslations('ai')
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('admin.step')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.model')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.status')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.latency')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.detail')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={`${step.id}-${step.model ?? ''}`} className="border-t border-border align-top">
              <td className="px-3 py-2 font-medium">{step.step}</td>
              <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground" title={step.model ?? ''}>
                {step.model ?? '—'}
              </td>
              <td className="px-3 py-2">
                <HealthBadge status={normalizeStepStatus(step)} ok={step.ok} />
              </td>
              <td className="px-3 py-2 tabular-nums">{step.latency_ms} ms</td>
              <td className="px-3 py-2 text-muted-foreground">
                <p className="line-clamp-2">{step.detail ?? '—'}</p>
                {step.error_code ? <p className="font-mono text-[11px]">{step.error_code}</p> : null}
                {step.technical ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer select-none">{t('technicalDetails')}</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-background/70 p-2 text-[10px]">
                      {JSON.stringify(step.technical, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HealthBadge({ status }: { status: ConnectionTestStep['status']; ok?: boolean }) {
  const t = useTranslations('ai')
  const label =
    status === 'passed'
      ? t('admin.passed')
      : status === 'timed_out'
        ? t('admin.timedOut')
        : status === 'unavailable'
          ? t('admin.unavailable')
          : status === 'skipped'
            ? t('admin.skipped')
            : status === 'not_tested'
              ? t('admin.notTested')
              : t('admin.failed')
  const cls =
    status === 'passed'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : status === 'timed_out' || status === 'unavailable'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : status === 'skipped' || status === 'not_tested'
          ? 'text-muted-foreground'
          : 'border-destructive/30 bg-destructive/10 text-destructive'
  return (
    <Badge variant="outline" className={cls}>
      {status === 'passed' ? <CheckCircle className="mr-1 h-3 w-3" aria-hidden /> : null}
      {status === 'failed' ? <XCircle className="mr-1 h-3 w-3" aria-hidden /> : null}
      {label}
    </Badge>
  )
}

function UsagePanel({ usage, error }: { usage: UsagePayload | null; error?: LoadError | null }) {
  const t = useTranslations('ai')
  if (error) return <ErrorLine message={error.message} />
  if (!usage) return <p className="text-sm text-muted-foreground">{t('loading')}</p>
  const chartConfig = {
    total: { label: t('admin.totalTokens'), color: 'var(--color-primary)' },
    failures: { label: t('admin.failedCallsLabel'), color: 'var(--color-destructive)' },
  } satisfies ChartConfig
  const modelData = usage.by_model.map((row) => ({
    model: shortModel(row.model),
    total: row.total_tokens,
    failures: row.failures,
  }))
  const roleConfig = {
    total: { label: t('admin.totalTokens'), color: 'var(--color-primary)' },
  } satisfies ChartConfig

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title={t('admin.inputTokens')} value={formatNumber(usage.month.input_tokens)} detail={t('admin.thisMonth')} icon={<Plugs className="h-4 w-4" aria-hidden />} />
        <MetricCard title={t('admin.outputTokens')} value={formatNumber(usage.month.output_tokens)} detail={t('admin.thisMonth')} icon={<Database className="h-4 w-4" aria-hidden />} />
        <MetricCard title={t('admin.reasoningTokens')} value={formatNumber(usage.month.reasoning_tokens)} detail={t('admin.thisMonth')} icon={<Robot className="h-4 w-4" aria-hidden />} />
        <MetricCard title={t('admin.failedCallsLabel')} value={formatNumber(usage.failures.count)} detail={t('admin.thisMonth')} icon={<WarningCircle className="h-4 w-4" aria-hidden />} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title={t('admin.budgetDay')} value={`${formatNumber(usage.budget.global_day.used_tokens)} / ${formatNumber(usage.budget.global_day.token_limit)}`} detail={t('admin.reserved', { count: usage.budget.global_day.reserved_tokens })} icon={<Gauge className="h-4 w-4" aria-hidden />} />
        <MetricCard title={t('admin.budgetMonth')} value={`${formatNumber(usage.budget.global_month.used_tokens)} / ${formatNumber(usage.budget.global_month.token_limit)}`} detail={t('admin.reserved', { count: usage.budget.global_month.reserved_tokens })} icon={<Gauge className="h-4 w-4" aria-hidden />} />
        <MetricCard title={t('admin.userReservedDay')} value={formatNumber(usage.budget.user_day.reserved_tokens)} detail={t('admin.reservedNow')} icon={<Clock className="h-4 w-4" aria-hidden />} />
        <MetricCard title={t('admin.callsToday')} value={formatNumber(usage.today.calls)} detail={t('admin.failedCalls', { count: usage.today.failed })} icon={<Clock className="h-4 w-4" aria-hidden />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('admin.usageTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.by_day.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('noDiagnostics')}</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <AreaChart data={usage.by_day}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Area
                  dataKey="total"
                  type="monotone"
                  fill="var(--color-total)"
                  fillOpacity={0.18}
                  stroke="var(--color-total)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('admin.byModel')}</CardTitle>
          </CardHeader>
          <CardContent>
            {modelData.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('noDiagnostics')}</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart data={modelData} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('admin.byRole')}</CardTitle>
          </CardHeader>
          <CardContent>
            {usage.by_role.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('noDiagnostics')}</p>
            ) : (
              <ChartContainer config={roleConfig} className="h-[220px] w-full">
                <BarChart data={usage.by_role}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="role" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={48} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }} />
                  <Bar dataKey="total_tokens" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
      {usage.failures.by_code.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('admin.failuresByCode')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2 text-xs">
              {usage.failures.by_code.map((row) => (
                <li key={row.code}>
                  <Badge variant="outline">
                    {row.code}: {row.count}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {usage.truncated ? (
        <p className="text-xs text-amber-300">{t('admin.usageTruncated')}</p>
      ) : null}
    </div>
  )
}

function DiagnosticsTable({ items, empty }: { items: DiagnosticItem[]; empty: string }) {
  const t = useTranslations('ai')
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('admin.time')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.model')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.errorCode')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.request')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.latency')}</th>
            <th className="px-3 py-2 font-medium">{t('admin.tools')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-border align-top">
              <td className="whitespace-nowrap px-3 py-2">{formatDate(item.created_at)}</td>
              <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-[11px]" title={item.model}>
                {shortModel(item.model)}
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="border-destructive/30 text-destructive">
                  {item.error_code ?? '—'}
                </Badge>
              </td>
              <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground" title={item.request_id}>
                {item.request_id.slice(0, 8)}…
              </td>
              <td className="px-3 py-2 tabular-nums">
                {item.latency_ms !== null ? `${item.latency_ms} ms` : '—'}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {item.tool_failures > 0 ? `${item.tool_failures} failed` : '—'}
                <details className="mt-1">
                  <summary className="cursor-pointer select-none">{t('technicalDetails')}</summary>
                  <pre className="mt-1 max-w-[28rem] overflow-x-auto rounded bg-background/70 p-2 text-[10px]">
                    {JSON.stringify(
                      {
                        request_id: item.request_id,
                        rounds: item.rounds,
                        ttft_ms: item.ttft_ms,
                        tokens: item.tokens,
                        technical: item.technical,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={5000}
        max={120000}
        step={1000}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return <p className="text-xs text-destructive">{message}</p>
}

async function readError(
  res: Response,
  tErrors: ReturnType<typeof useTranslations<'errors'>>,
): Promise<LoadError> {
  const body = (await res.json().catch(() => null)) as ApiErrorResponse | null
  return {
    code: body?.code ?? 'SERVER_ERROR',
    message: body ? getErrorMessage(body, tErrors) : `HTTP ${res.status}`,
  }
}

function normalizeStepStatus(step: ConnectionTestStep): ConnectionTestStep['status'] {
  if (step.status) return step.status
  if (step.ok) return 'passed'
  if (step.error_code === 'TIMEOUT') return 'timed_out'
  if (
    step.error_code === 'PROVIDER_UNAVAILABLE' ||
    step.error_code === 'MODEL_UNAVAILABLE' ||
    step.error_code === 'NETWORK_ERROR' ||
    step.error_code === 'TLS_ERROR' ||
    step.error_code === 'RATE_LIMITED'
  ) {
    return 'unavailable'
  }
  return 'failed'
}

function firstFailure(result: ConnectionTestResult): string {
  const failed = result.steps.find((step) => !step.ok && normalizeStepStatus(step) !== 'skipped')
  return failed ? `${failed.step}: ${failed.error_code ?? normalizeStepStatus(failed)}` : '—'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function shortModel(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] ?? model
}

async function copyDiagnostics(
  diagnostics: DiagnosticsPayload | null,
  toast: typeof import('sonner').toast,
  t: ReturnType<typeof useTranslations<'ai'>>,
): Promise<void> {
  if (!diagnostics) return
  const lines = [
    '# darkTunes AI diagnostics',
    '',
    ...diagnostics.items.map((item) =>
      [
        `- ${item.created_at} | ${item.error_code ?? 'unknown'} | ${item.model}`,
        `  request=${item.request_id} user=${item.user_id} artist=${item.artist_id ?? '—'}`,
        `  tokens=${item.tokens.total} latency=${item.latency_ms ?? '—'}ms rounds=${item.rounds} tools_failed=${item.tool_failures}`,
      ].join('\n'),
    ),
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    toast.success(t('admin.reportCopied'))
  } catch {
    toast.error(t('admin.reportCopyFailed'))
  }
}
