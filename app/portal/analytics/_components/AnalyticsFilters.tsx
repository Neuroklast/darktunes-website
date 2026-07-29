'use client'

import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  resolvePeriodPreset,
  type AnalyticsFilterState,
  type PeriodPreset,
} from '@/lib/analytics/filterMetrics'
import { cn } from '@/lib/utils'

interface AnalyticsFiltersProps {
  filters: AnalyticsFilterState
  periods: string[]
  platforms: string[]
  countries: string[]
  periodPreset: PeriodPreset
  onChange: (next: AnalyticsFilterState) => void
  onPeriodPresetChange: (preset: PeriodPreset) => void
}

const ALL = '__all__'

const PRESETS: PeriodPreset[] = ['all', '3m', '6m', '12m']

export function AnalyticsFilters({
  filters,
  periods,
  platforms,
  countries,
  periodPreset,
  onChange,
  onPeriodPresetChange,
}: AnalyticsFiltersProps) {
  const t = useTranslations('portal')

  const applyPreset = (preset: PeriodPreset) => {
    onPeriodPresetChange(preset)
    if (preset === 'custom') return
    const range = resolvePeriodPreset(periods, preset)
    onChange({ ...filters, ...range })
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">
          {t('analytics_period_presets_label')}
        </span>
        {PRESETS.map((preset) => {
          const labelKey =
            preset === '3m'
              ? 'analytics_period_preset_3m'
              : preset === '6m'
                ? 'analytics_period_preset_6m'
                : preset === '12m'
                  ? 'analytics_period_preset_12m'
                  : 'analytics_period_preset_all'
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={periodPreset === preset ? 'default' : 'outline'}
              className={cn('h-8 px-3 text-xs')}
              onClick={() => applyPreset(preset)}
            >
              {t(labelKey)}
            </Button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1.5 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">{t('analytics_filter_from')}</Label>
          <Select
            value={filters.periodFrom || ALL}
            onValueChange={(v) => {
              onPeriodPresetChange('custom')
              onChange({ ...filters, periodFrom: v === ALL ? '' : v })
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('analytics_filter_all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('analytics_filter_all')}</SelectItem>
              {periods.map((p) => (
                <SelectItem key={`from-${p}`} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">{t('analytics_filter_to')}</Label>
          <Select
            value={filters.periodTo || ALL}
            onValueChange={(v) => {
              onPeriodPresetChange('custom')
              onChange({ ...filters, periodTo: v === ALL ? '' : v })
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('analytics_filter_all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('analytics_filter_all')}</SelectItem>
              {periods.map((p) => (
                <SelectItem key={`to-${p}`} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">{t('analytics_filter_platform')}</Label>
          <Select
            value={filters.platform || ALL}
            onValueChange={(v) => onChange({ ...filters, platform: v === ALL ? '' : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('analytics_filter_all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('analytics_filter_all')}</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">{t('analytics_filter_country')}</Label>
          <Select
            value={filters.country || ALL}
            onValueChange={(v) => onChange({ ...filters, country: v === ALL ? '' : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('analytics_filter_all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('analytics_filter_all')}</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
