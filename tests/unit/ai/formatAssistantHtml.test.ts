import { describe, expect, it } from 'vitest'
import { formatAssistantHtml } from '@/lib/ai/presentation/formatAssistantHtml'

describe('formatAssistantHtml', () => {
  it('makes plain platform URLs compact without changing destinations', () => {
    const input = '<p><a href="https://open.spotify.com/artist/123">https://open.spotify.com/artist/123</a></p>'
    const formatted = formatAssistantHtml(input, 'Response table')
    expect(formatted).toContain('>Spotify</a>')
    expect(formatted).toContain('href="https://open.spotify.com/artist/123"')
    expect(formatted).toContain('target="_blank" rel="noopener noreferrer"')
  })

  it('does not replace descriptive link labels or unrelated links', () => {
    const input = '<a href="https://open.spotify.com/artist/123">My artist</a> <a href="/admin">Admin</a>'
    const formatted = formatAssistantHtml(input, 'Response table')
    expect(formatted).toContain('>My artist</a>')
    expect(formatted).toContain('<a href="/admin">Admin</a>')
    expect(formatted).not.toContain('dt-ai-platform-link')
  })

  it('labels short table rows for compact cards and preserves content', () => {
    const input = '<table><thead><tr><th>Title</th><th>Date</th></tr></thead><tbody><tr><td>HELLFIRE</td><td>13 March 2026</td></tr></tbody></table>'
    const formatted = formatAssistantHtml(input, 'Response table')
    expect(formatted).toContain('dt-ai-table-cards')
    expect(formatted).toContain('data-label="Title"')
    expect(formatted).toContain('data-label="Date"')
    expect(formatted).toContain('HELLFIRE')
    expect(formatted).toContain('tabindex="0"')
  })

  it('keeps wide tables scrollable rather than creating huge cards', () => {
    const headings = ['A', 'B', 'C', 'D', 'E', 'F']
    const input = '<table><thead><tr>' + headings.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody><tr>' + headings.map((h) => '<td>' + h + '</td>').join('') + '</tr></tbody></table>'
    const formatted = formatAssistantHtml(input, 'Response table')
    expect(formatted).toContain('dt-ai-table-scroll')
    expect(formatted).not.toContain('dt-ai-table-cards')
  })

  it('escapes header text before inserting it in data labels', () => {
    const input = '<table><thead><tr><th>A &quot;quoted&quot; &amp; title</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>'
    const formatted = formatAssistantHtml(input, 'A "table"')
    expect(formatted).toContain('data-label="A &quot;quoted&quot; &amp; title"')
    expect(formatted).toContain('aria-label="A &quot;table&quot;"')
  })
})
