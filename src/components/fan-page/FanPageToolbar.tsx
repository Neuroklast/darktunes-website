'use client'

import { useTranslations } from 'next-intl'
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ClockCounterClockwise,
  Command,
  DeviceMobile,
  Desktop,
  Eye,
  RocketLaunch,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useFanPageEditorStore,
  useFanPageEditorStoreApi,
  useFanPageEditorTemporal,
} from '@/lib/fan-page/editor/FanPageEditorProvider'
import { FanPageSaveStatus } from './FanPageSaveStatus'
import { FAN_PAGE_OPEN_COMMAND_PALETTE_EVENT } from './FanPageCommandPalette'
import type { FanPageSaveStatus as SaveStatus } from '@/hooks/useFanPageAutosave'
import { cn } from '@/lib/utils'

interface FanPageToolbarProps {
  onPublish: (mode: 'submit_review' | 'publish_direct') => void
  onOpenHistory: () => void
  onOpenSmartPreview: () => void
  isPublishing: boolean
  canPublishDirect: boolean
  publishStatus: string
  saveStatus: SaveStatus
  isDirty: boolean
  isPreviewLoading?: boolean
  /** Mobile: tighter chrome — icon device toggle, primary Publish. */
  compact?: boolean
}

export function FanPageToolbar({
  onPublish,
  onOpenHistory,
  onOpenSmartPreview,
  isPublishing,
  canPublishDirect,
  publishStatus,
  saveStatus,
  isDirty,
  isPreviewLoading = false,
  compact = false,
}: FanPageToolbarProps) {
  const t = useTranslations('portal')
  const store = useFanPageEditorStoreApi()
  const previewDevice = useFanPageEditorStore((s) => s.previewDevice)
  const setPreviewDevice = useFanPageEditorStore((s) => s.setPreviewDevice)

  const pastStates = useFanPageEditorTemporal((s) => s.pastStates)
  const futureStates = useFanPageEditorTemporal((s) => s.futureStates)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center',
        compact ? 'gap-1.5' : 'gap-2',
      )}
      role="toolbar"
      aria-label={t('fanPage_toolbar_label')}
    >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="min-h-[44px] min-w-[44px] h-11 w-11"
              disabled={pastStates.length === 0}
              onClick={() => store.temporal.getState().undo()}
              aria-label={t('fanPage_undo')}
            >
              <ArrowCounterClockwise size={18} aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('fanPage_undo')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="min-h-[44px] min-w-[44px] h-11 w-11"
              disabled={futureStates.length === 0}
              onClick={() => store.temporal.getState().redo()}
              aria-label={t('fanPage_redo')}
            >
              <ArrowClockwise size={18} aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('fanPage_redo')}</TooltipContent>
        </Tooltip>

        {!compact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px] h-11 w-11"
                disabled={pastStates.length === 0}
                onClick={onOpenHistory}
                aria-label={t('fanPage_history_title')}
              >
                <ClockCounterClockwise size={18} aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('fanPage_history_title')}</TooltipContent>
          </Tooltip>
        ) : null}

        <Separator orientation="vertical" className="mx-1 h-6" />

        {compact ? (
          <div
            className="inline-flex rounded-md border border-border p-0.5"
            role="group"
            aria-label={t('fanPage_device_group')}
          >
            <Button
              type="button"
              variant={previewDevice === 'desktop' ? 'default' : 'ghost'}
              size="icon"
              className="min-h-[40px] min-w-[40px] h-10 w-10"
              aria-pressed={previewDevice === 'desktop'}
              aria-label={t('fanPage_device_desktop')}
              onClick={() => setPreviewDevice('desktop')}
            >
              <Desktop size={16} aria-hidden />
            </Button>
            <Button
              type="button"
              variant={previewDevice === 'mobile' ? 'default' : 'ghost'}
              size="icon"
              className="min-h-[40px] min-w-[40px] h-10 w-10"
              aria-pressed={previewDevice === 'mobile'}
              aria-label={t('fanPage_device_mobile')}
              onClick={() => setPreviewDevice('mobile')}
            >
              <DeviceMobile size={16} aria-hidden />
            </Button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant={previewDevice === 'desktop' ? 'default' : 'outline'}
              size="sm"
              className="min-h-[36px]"
              onClick={() => setPreviewDevice('desktop')}
            >
              <Desktop size={16} className="mr-1.5" aria-hidden />
              {t('fanPage_device_desktop')}
            </Button>
            <Button
              type="button"
              variant={previewDevice === 'mobile' ? 'default' : 'outline'}
              size="sm"
              className="min-h-[36px]"
              onClick={() => setPreviewDevice('mobile')}
            >
              <DeviceMobile size={16} className="mr-1.5" aria-hidden />
              {t('fanPage_device_mobile')}
            </Button>
          </>
        )}

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={compact ? 'icon' : 'sm'}
              className={compact ? 'min-h-[44px] min-w-[44px] h-11 w-11' : 'min-h-[36px]'}
              disabled={isPreviewLoading || saveStatus === 'saving' || saveStatus === 'pending'}
              onClick={onOpenSmartPreview}
              aria-label={t('fanPage_smart_preview')}
            >
              <Eye size={16} className={compact ? undefined : 'mr-1.5'} aria-hidden />
              {!compact
                ? isPreviewLoading
                  ? t('fanPage_preview_opening')
                  : t('fanPage_smart_preview')
                : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('fanPage_smart_preview_hint')}</TooltipContent>
        </Tooltip>

        {!compact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(FAN_PAGE_OPEN_COMMAND_PALETTE_EVENT))
                }
                aria-label={t('fanPage_cmd_tooltip')}
              >
                <Command size={18} aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('fanPage_cmd_tooltip')}</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px] h-11 w-11"
                disabled={pastStates.length === 0}
                onClick={onOpenHistory}
                aria-label={t('fanPage_history_title')}
              >
                <ClockCounterClockwise size={18} aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('fanPage_history_title')}</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              className="min-h-[44px]"
              disabled={isPublishing}
            >
              <RocketLaunch size={16} className="mr-1.5" aria-hidden />
              {isPublishing ? t('fanPage_publishing') : t('fanPage_publish')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onPublish('submit_review')}>
              {t('fanPage_publish_review')}
            </DropdownMenuItem>
            {canPublishDirect ? (
              <DropdownMenuItem onSelect={() => onPublish('publish_direct')}>
                {t('fanPage_publish_direct')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <FanPageSaveStatus
          status={saveStatus}
          isDirty={isDirty}
          className={compact ? 'w-full basis-full sm:ml-auto sm:w-auto sm:basis-auto' : 'ml-auto'}
        />

        {!compact ? (
          <span className="text-xs text-muted-foreground capitalize">
            {publishStatus.replace(/_/g, ' ')}
          </span>
        ) : null}
    </div>
  )
}