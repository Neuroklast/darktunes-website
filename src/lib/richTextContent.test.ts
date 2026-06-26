import { describe, it, expect } from 'vitest'
import { normalizeRichTextHtml } from './richTextContent'

describe('normalizeRichTextHtml', () => {
  it('converts empty paragraphs to br placeholders', () => {
    expect(normalizeRichTextHtml('<p>First</p><p></p><p>Second</p>')).toBe(
      '<p>First</p><p><br></p><p>Second</p>',
    )
  })

  it('normalizes Tiptap trailing-break paragraphs', () => {
    expect(
      normalizeRichTextHtml(
        '<p>Line one</p><p><br class="ProseMirror-trailingBreak"></p><p>Line two</p>',
      ),
    ).toBe('<p>Line one</p><p><br></p><p>Line two</p>')
  })

  it('leaves regular paragraphs unchanged', () => {
    const html = '<p>Paragraph one</p><p>Paragraph two</p>'
    expect(normalizeRichTextHtml(html)).toBe(html)
  })
})