'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sparkle } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { AssistantWorkspace } from '@/components/ai/AssistantWorkspace'
import { useAssistantSession } from '@/components/ai/useAssistantSession'

interface AssistantShellProps {
  dashboard: 'portal' | 'admin' | 'editor'
}

export function AssistantShell({ dashboard }: AssistantShellProps) {
  const t = useTranslations('ai')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const artistId = searchParams.get('artistId')
  const errorRef = searchParams.get('error_ref') ?? searchParams.get('ai_error')
  const session = useAssistantSession({
    dashboard,
    pathname,
    initialArtistId: artistId,
    errorRef,
  })
  const { open, setOpen } = session
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!errorRef) return
    const current = sessionRef.current
    current.setOpen(true)
    if (!current.draft) {
      current.setDraft(`Please explain error ${errorRef}`)
    }
  }, [errorRef])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          'fixed bottom-4 right-4 z-[40] h-11 w-11 rounded-full border-border bg-card shadow-lg',
          'md:bottom-6 md:right-6',
          'focus-visible:ring-2 focus-visible:ring-ring/60',
        )}
        onClick={() => session.setOpen(true)}
        aria-label={t('open')}
        aria-expanded={session.open}
      >
        <Sparkle className="h-5 w-5" aria-hidden />
      </Button>
      <Sheet open={session.open} onOpenChange={session.setOpen}>
        <SheetContent
          side="right"
          className={cn(
            'flex h-dvh w-full flex-col gap-0 p-0 [&>button.absolute]:hidden',
            'sm:max-w-[min(1120px,calc(100vw-2rem))]',
            session.maximized
              ? 'sm:w-[calc(100vw-1rem)] sm:max-w-none'
              : 'sm:w-[min(720px,calc(100vw-2rem))]',
          )}
          aria-label={t('title')}
        >
          <AssistantWorkspace session={session} onClose={() => session.setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
