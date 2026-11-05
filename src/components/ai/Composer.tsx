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
      className="shrink-0 border-t border-border/70 bg-card/60 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && value.trim() && !disabled) onSend()
      }}
    >
      <div className="mx-auto flex max-w-[58rem] items-end gap-2 rounded-xl border border-input bg-background p-1.5 shadow-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            'max-h-40 min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-2.5 py-2',
            'text-sm leading-relaxed text-foreground placeholder:text-muted-foreground',
            'focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
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
            className="h-10 w-10 shrink-0 rounded-lg"
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
      <p className="mx-auto mt-1.5 hidden max-w-[58rem] text-right text-[11px] text-muted-foreground sm:block">
        {t('composerHint')}
      </p>
    </form>
  )
}
