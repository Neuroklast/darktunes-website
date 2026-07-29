'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChartLineUp, Funnel, FileArrowDown, Question } from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function AnalyticsHubAssistant() {
  const t = useTranslations('portal')

  const cards = [
    {
      icon: ChartLineUp,
      title: t('analytics_assistant_streams_title'),
      body: t('analytics_assistant_streams_body'),
    },
    {
      icon: Funnel,
      title: t('analytics_assistant_filters_title'),
      body: t('analytics_assistant_filters_body'),
    },
    {
      icon: FileArrowDown,
      title: t('analytics_assistant_export_title'),
      body: t('analytics_assistant_export_body'),
    },
  ]

  return (
    <section
      className="rounded-lg border border-border bg-card/40 p-4 sm:p-5 space-y-4"
      aria-labelledby="analytics-assistant-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 id="analytics-assistant-heading" className="text-sm font-semibold">
            {t('analytics_assistant_heading')}
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            {t('analytics_assistant_subheading')}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 shrink-0" asChild>
          <Link href="/portal/help#analytics">
            <Question size={14} aria-hidden="true" />
            {t('analytics_help_link')}
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="border-border/80 bg-background/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <card.icon size={16} className="text-primary shrink-0" aria-hidden="true" />
                {card.title}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
