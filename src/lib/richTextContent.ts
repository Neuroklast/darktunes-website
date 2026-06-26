/**
 * Shared Tailwind classes for admin-authored HTML (Tiptap) on public pages.
 *
 * The project does not use @tailwindcss/typography, so bare `prose` utilities
 * have no effect. These arbitrary selectors mirror the pattern used on About
 * and Datenschutz pages.
 */
export const RICH_TEXT_CONTENT_CLASS =
  'max-w-none text-foreground/90 leading-relaxed font-serif ' +
  '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:tracking-tight ' +
  '[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:tracking-tight ' +
  '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 ' +
  '[&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 ' +
  '[&_p]:text-foreground/90 [&_p]:mb-4 ' +
  '[&_p:empty]:min-h-[1.25em] [&_p:has(>br:only-child)]:min-h-[1.25em] ' +
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:opacity-80 ' +
  '[&_strong]:text-foreground [&_strong]:font-semibold ' +
  '[&_em]:italic ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-4 [&_ul]:space-y-1 ' +
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-4 [&_ol]:space-y-1 ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-4 ' +
  '[&_hr]:my-8 [&_hr]:border-border ' +
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm'

/**
 * Ensures blank lines from Tiptap survive rendering.
 * Empty paragraphs and br-only paragraphs get a visible line break.
 */
export function normalizeRichTextHtml(html: string): string {
  if (!html) return ''

  return html
    .replace(/<p>(?:\s|&nbsp;)*<\/p>/gi, '<p><br></p>')
    .replace(
      /<p>(?:\s|&nbsp;)*<br\b[^>]*>(?:\s|&nbsp;)*<\/p>/gi,
      '<p><br></p>',
    )
}