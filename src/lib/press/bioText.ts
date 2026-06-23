/** Strip HTML tags to plain text (server-safe). */
export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildBioTxtDocument(artistName: string, tierLabel: string, body: string, pressQuote?: string): string {
  const lines = [`${artistName} — ${tierLabel}`, '='.repeat(Math.min(60, artistName.length + tierLabel.length + 3)), '']
  if (pressQuote) {
    lines.push(`"${pressQuote}"`, '')
  }
  lines.push(body, '')
  return lines.join('\n')
}