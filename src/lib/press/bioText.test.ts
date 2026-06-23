import { describe, it, expect } from 'vitest'
import { stripHtmlToPlainText, buildBioTxtDocument } from './bioText'

describe('bioText', () => {
  it('strips HTML to plain text', () => {
    expect(stripHtmlToPlainText('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('builds a txt document with header and quote', () => {
    const doc = buildBioTxtDocument('Band X', 'Short Bio', 'Body text', 'A quote')
    expect(doc).toContain('Band X — Short Bio')
    expect(doc).toContain('"A quote"')
    expect(doc).toContain('Body text')
  })
})