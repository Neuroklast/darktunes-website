'use client'

/**
 * NewsBodyClient — Client component that safely renders HTML news content.
 *
 * Uses DOMPurify to sanitise admin-authored HTML before injecting it into
 * the DOM. Images in the HTML are proxied through wsrv.nl (via processHtmlImages)
 * for WebP conversion, resizing, and CDN caching.
 * Isolated as a minimal 'use client' leaf so the parent RSC remains server-rendered.
 */

import { processHtmlImages } from '@/lib/imageUtils'
import { normalizeRichTextHtml, RICH_TEXT_CONTENT_CLASS } from '@/lib/richTextContent'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

interface NewsBodyClientProps {
  content: string
}

export function NewsBodyClient({ content }: NewsBodyClientProps) {
  const sanitized = processHtmlImages(
    sanitizeHtml(normalizeRichTextHtml(content), { ADD_TAGS: ['iframe'] }),
  )
  return (
    <div
      suppressHydrationWarning
      className={RICH_TEXT_CONTENT_CLASS}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
