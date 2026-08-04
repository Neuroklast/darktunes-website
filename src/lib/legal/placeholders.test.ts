import { describe, expect, it } from 'vitest'
import { listUnresolvedPlaceholders, renderLegalTemplate } from './placeholders'

describe('renderLegalTemplate', () => {
  it('replaces known placeholders', () => {
    const out = renderLegalTemplate('Hello {{labelName}} — {{email}}', {
      labelName: 'Acme Label',
      email: 'a@example.com',
    })
    expect(out).toBe('Hello Acme Label — a@example.com')
  })

  it('replaces missing keys with empty string', () => {
    expect(renderLegalTemplate('X {{missing}} Y', {})).toBe('X  Y')
  })

  it('allows whitespace inside braces', () => {
    expect(renderLegalTemplate('{{ labelName }}', { labelName: 'Z' })).toBe('Z')
  })
})

describe('listUnresolvedPlaceholders', () => {
  it('lists keys with empty values', () => {
    const missing = listUnresolvedPlaceholders('{{labelName}} {{vatId}}', {
      labelName: 'A',
      vatId: '',
    })
    expect(missing).toEqual(['vatId'])
  })
})
