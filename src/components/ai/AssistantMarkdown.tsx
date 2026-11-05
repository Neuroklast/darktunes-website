'use client'

import { useMemo } from 'react'
import { marked } from 'marked'
import { useTranslations } from 'next-intl'
import { formatAssistantHtml } from '@/lib/ai/presentation/formatAssistantHtml'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { cn } from '@/lib/utils'
import styles from './AssistantMarkdown.module.css'

export function AssistantMarkdown({
  content,
  streaming,
  className,
}: {
  content: string
  streaming: boolean
  className?: string
}) {
  const t = useTranslations('ai')
  const tableLabel = t('tableScrollLabel')
  const html = useMemo(() => {
    if (!content || streaming) return ''
    const parsed = marked.parse(content, { async: false, gfm: true, breaks: true })
    return typeof parsed === 'string'
      ? formatAssistantHtml(sanitizeHtml(parsed), tableLabel)
      : ''
  }, [content, streaming, tableLabel])

  if (streaming) {
    return (
      <div className={cn(styles.markdown, 'whitespace-pre-wrap', className)}>
        {content}
      </div>
    )
  }

  return (
    <div
      className={cn(styles.markdown, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
