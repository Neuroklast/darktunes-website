/**
 * Small, safe presentation-only enhancements applied AFTER sanitizing Markdown.
 * The output is never used as a source of truth for artist or release data.
 */
const PLATFORM_NAMES: Record<string, { name: string; id: string }> = {
  'open.spotify.com': { name: 'Spotify', id: 'spotify' },
  'music.apple.com': { name: 'Apple Music', id: 'apple' },
  'music.amazon.com': { name: 'Amazon Music', id: 'amazon' },
  'amazon.com': { name: 'Amazon', id: 'amazon' },
  'tidal.com': { name: 'TIDAL', id: 'tidal' },
  'listen.tidal.com': { name: 'TIDAL', id: 'tidal' },
  'beatport.com': { name: 'Beatport', id: 'beatport' },
  'www.beatport.com': { name: 'Beatport', id: 'beatport' },
  'bandcamp.com': { name: 'Bandcamp', id: 'bandcamp' },
  'soundcloud.com': { name: 'SoundCloud', id: 'soundcloud' },
  'youtube.com': { name: 'YouTube', id: 'youtube' },
  'www.youtube.com': { name: 'YouTube', id: 'youtube' },
  'youtu.be': { name: 'YouTube', id: 'youtube' },
  'instagram.com': { name: 'Instagram', id: 'instagram' },
  'www.instagram.com': { name: 'Instagram', id: 'instagram' },
  'deezer.com': { name: 'Deezer', id: 'deezer' },
  'www.deezer.com': { name: 'Deezer', id: 'deezer' },
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

function headerText(html: string): string {
  return decodeBasicEntities(html.replace(/<[^>]*>/g, '')).trim()
}

export function formatAssistantHtml(sanitizedHtml: string, tableLabel: string): string {
  // Only process the already sanitized output. No external URL or HTML is fetched.
  const withLinks = sanitizedHtml.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole, attributes: string, inner: string) => {
      const href = attributes.match(/\bhref\s*=\s*"([^"]*)"/i)?.[1]
      if (!href) return whole
      let url: URL
      try {
        url = new URL(decodeBasicEntities(href))
      } catch {
        return whole
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return whole

      const safeAttributes = attributes
        .replace(/\s+target\s*=\s*"[^"]*"/gi, '')
        .replace(/\s+rel\s*=\s*"[^"]*"/gi, '')
      const linkAttributes = `${safeAttributes} target="_blank" rel="noopener noreferrer"`
      const displayed = headerText(inner)
      const platform = PLATFORM_NAMES[url.hostname.toLowerCase()]
      // Never replace authored link labels, only an unhelpful raw URL.
      if (platform && /^https?:\/\//i.test(displayed)) {
        try {
          if (new URL(displayed).href === url.href) {
            return `<a${linkAttributes} class="dt-ai-platform-link" data-platform="${platform.id}"><span class="dt-ai-platform-dot" aria-hidden="true"></span>${platform.name}</a>`
          }
        } catch {
          // Keep the user's actual text if it is not a complete URL.
        }
      }
      return `<a${linkAttributes}>${inner}</a>`
    },
  )

  return withLinks.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
    const thead = table.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/i)?.[0] ?? ''
    const headers = Array.from(thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)).map((match) =>
      headerText(match[1]),
    )
    // Narrow tables become stacked, labelled rows via CSS container queries.
    // Extra-wide tables remain horizontally scrollable with keyboard access.
    const cardLayout = headers.length > 0 && headers.length <= 5
    const labelledTable = cardLayout
      ? table.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi, (wholeRow, attrs: string, cells: string) => {
          if (!/<td\b/i.test(cells)) return wholeRow
          let column = 0
          const labelled = cells.replace(
            /<td\b([^>]*)>([\s\S]*?)<\/td>/gi,
            (_cell, tdAttrs: string, value: string) => {
              const label = escapeAttribute(headers[column] ?? '')
              column++
              return `<td${tdAttrs} data-label="${label}">${value}</td>`
            },
          )
          return `<tr${attrs}>${labelled}</tr>`
        })
      : table
    return `<div class="dt-ai-table-scroll${cardLayout ? ' dt-ai-table-cards' : ''}" role="region" tabindex="0" aria-label="${escapeAttribute(tableLabel)}">${labelledTable}</div>`
  })
}
