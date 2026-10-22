/**
 * src/components/admin/AdminOverview.tsx
 *
 * Task-oriented admin landing page. Shows real work queues first, then recent
 * activity, compact content metrics, and a system note only when unresolved
 * errors actually exist. Navigation duplication is intentionally avoided:
 * links here start a concrete task or open the matching queue.
 */

import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  MusicNotes,
  Newspaper,
  VideoCamera,
  User,
  Wallet,
  ChatCircle,
  UploadSimple,
  Globe,
  Receipt,
  FileText,
  Warning,
  ArrowRight,
  CheckCircle,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr'
import { getCmsTabPath } from '@/lib/editor/cmsPaths'
import type { AdminDashboardData } from '@/lib/api/adminDashboard'

export interface StatCounts {
  artists: number
  releases: number
  news: number
  videos: number
}

interface AdminOverviewProps {
  counts: StatCounts
  data: AdminDashboardData
  isEditor: boolean
}

type TaskKey =
  | 'releaseSubmissions'
  | 'videoSubmissions'
  | 'fanPageReviews'
  | 'unreadMessages'
  | 'statementsToReview'
  | 'overdueInvoices'

interface TaskDef {
  key: TaskKey
  count: number
  href: string
  icon: React.ElementType
  tone?: 'warning'
}

function taskHref(key: TaskKey, isEditor: boolean): string {
  switch (key) {
    case 'releaseSubmissions':
      return isEditor ? getCmsTabPath('editor', 'release-submissions') : '/admin/release-submissions'
    case 'videoSubmissions':
      return isEditor ? getCmsTabPath('editor', 'video-submissions') : '/admin/video-submissions'
    case 'fanPageReviews':
      return isEditor ? getCmsTabPath('editor', 'fan-page-reviews') : '/admin/fan-page-reviews'
    case 'unreadMessages':
      return '/admin/messages'
    case 'statementsToReview':
      return '/admin/statements'
    case 'overdueInvoices':
      return '/admin/invoices'
  }
}

export async function AdminOverview({ counts, data, isEditor }: AdminOverviewProps) {
  const t = await getTranslations('admin.overview')
  const locale = await getLocale()
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const tasks: TaskDef[] = [
    { key: 'releaseSubmissions', count: data.counts.releaseSubmissions, href: taskHref('releaseSubmissions', isEditor), icon: UploadSimple },
    { key: 'videoSubmissions', count: data.counts.videoSubmissions, href: taskHref('videoSubmissions', isEditor), icon: VideoCamera },
    { key: 'fanPageReviews', count: data.counts.fanPageReviews, href: taskHref('fanPageReviews', isEditor), icon: Globe },
    ...(isEditor
      ? []
      : [
          { key: 'unreadMessages' as const, count: data.counts.unreadMessages, href: taskHref('unreadMessages', isEditor), icon: ChatCircle },
          { key: 'statementsToReview' as const, count: data.counts.statementsToReview, href: taskHref('statementsToReview', isEditor), icon: Receipt },
          { key: 'overdueInvoices' as const, count: data.counts.overdueInvoices, href: taskHref('overdueInvoices', isEditor), icon: FileText, tone: 'warning' as const },
        ]),
  ]
  const openTasks = tasks.filter((task) => task.count > 0)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-5 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {isEditor ? t('introEditor') : t('introAdmin')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickAction
            href={isEditor ? getCmsTabPath('editor', 'artists') : '/admin/artists'}
            label={t('actionManageArtists')}
            icon={UsersThree}
          />
          <QuickAction
            href={isEditor ? getCmsTabPath('editor', 'releases') : '/admin/releases'}
            label={t('actionNewRelease')}
            icon={MusicNotes}
          />
          {isEditor ? null : (
            <QuickAction
              href="/admin/accounting"
              label={t('actionAccounting')}
              icon={Wallet}
            />
          )}
        </div>
      </header>

      <section aria-labelledby="admin-tasks-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="admin-tasks-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('tasksHeading')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {openTasks.length === 0 ? t('tasksClear') : t('tasksOpen', { count: openTasks.length })}
          </span>
        </div>
        {openTasks.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <CheckCircle size={20} className="shrink-0 text-emerald-500" aria-hidden />
            <p>{t('tasksEmpty')}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {openTasks.map(({ key, count, href, icon: Icon, tone }) => (
              <Link
                key={key}
                href={href}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <div
                  className={
                    tone === 'warning'
                      ? 'rounded-md bg-amber-500/10 p-2.5 text-amber-400'
                      : 'rounded-md bg-primary/10 p-2.5 text-primary'
                  }
                >
                  <Icon size={20} weight="duotone" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t(`task.${key}.title`)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(`task.${key}.hint`)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums text-foreground">
                  {count}
                </span>
                <ArrowRight size={16} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="admin-activity-heading" className="space-y-3">
          <h2 id="admin-activity-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('activityHeading')}
          </h2>
          <div className="rounded-lg border border-border bg-card">
            {data.activity.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t('activityEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.activity.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 p-3.5">
                    <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
                      {item.kind === 'message' ? (
                        <ChatCircle size={15} aria-hidden />
                      ) : item.kind === 'video' ? (
                        <VideoCamera size={15} aria-hidden />
                      ) : item.kind === 'fanPage' ? (
                        <Globe size={15} aria-hidden />
                      ) : item.kind === 'news' ? (
                        <Newspaper size={15} aria-hidden />
                      ) : (
                        <MusicNotes size={15} aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {item.kind === 'fanPage'
                          ? t('activityFanPage')
                          : item.title || t(`activityKind.${item.kind}`)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t(`activityKind.${item.kind}`)} · {dateFormat.format(new Date(item.at))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="admin-metrics-heading" className="space-y-3">
          <h2 id="admin-metrics-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('metricsHeading')}
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Metric label={t('metric.artists')} value={counts.artists} icon={User} href={isEditor ? getCmsTabPath('editor', 'artists') : '/admin/artists'} />
            <Metric label={t('metric.releases')} value={counts.releases} icon={MusicNotes} href={isEditor ? getCmsTabPath('editor', 'releases') : '/admin/releases'} />
            <Metric label={t('metric.news')} value={counts.news} icon={Newspaper} href={isEditor ? getCmsTabPath('editor', 'news') : '/admin/news'} />
            <Metric label={t('metric.videos')} value={counts.videos} icon={VideoCamera} href={isEditor ? getCmsTabPath('editor', 'videos') : '/admin/videos'} />
          </div>
        </section>
      </div>

      {!isEditor && data.counts.recentErrors > 0 ? (
        <section aria-labelledby="admin-system-heading" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <Warning size={20} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 id="admin-system-heading" className="text-sm font-semibold text-foreground">
                {t('systemHeading')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('systemErrors', { count: data.counts.recentErrors })}
              </p>
            </div>
            <Link href="/admin/system" className="shrink-0 text-sm font-medium text-primary hover:underline">
              {t('systemOpen')}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function QuickAction({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: React.ElementType
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Icon size={16} className="text-primary" aria-hidden />
      {label}
    </Link>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string
  value: number
  icon: React.ElementType
  href: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon size={14} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </Link>
  )
}
