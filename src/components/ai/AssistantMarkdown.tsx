'use client'

import { useMemo } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { cn } from '@/lib/utils'

export function AssistantMarkdown({
  content,
  streaming,
  className,
}: {
  content: string
  streaming: boolean
  className?: string
}) {
  const html = useMemo(() => {
    if (!content || streaming) return ''
    const parsed = marked.parse(content, { async: false, gfm: true, breaks: true })
    return typeof parsed === 'string' ? sanitizeHtml(parsed) : ''
  }, [content, streaming])

  if (streaming) {
    return (
      <div className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed', className)}>
        {content}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'max-w-none break-words text-sm leading-relaxed text-foreground',
        '[&_p]:mb-2 [&_p:last-child]:mb-0',
        '[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold',
        '[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold',
        '[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5 [&_li>p]:mb-0',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-background/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8em]',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-background/80 [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
        '[&_hr]:my-3 [&_hr]:border-border',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
