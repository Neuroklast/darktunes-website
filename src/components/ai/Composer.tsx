'use client'

import { useEffect, useRef } from 'react'
import { PaperPlaneTilt, Square } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  disabled: boolean
  placeholder: string
}) {
  const t = useTranslations('ai')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`
  }, [value])

  return (
    <form
      className="shrink-0 border-t border-border bg-card/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && value.trim() && !disabled) onSend()
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            'max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5',
            'text-sm leading-relaxed text-foreground placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!busy && value.trim() && !disabled) onSend()
            }
          }}
        />
        {busy ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={onStop}
            aria-label={t('stop')}
            className="h-11 w-11 shrink-0"
          >
            <Square className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !value.trim()}
            aria-label={t('send')}
            className="h-11 w-11 shrink-0"
          >
            <PaperPlaneTilt className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
      <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
        {t('composerHint')}
      </p>
    </form>
  )
}
