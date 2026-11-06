import { describe, expect, it } from 'vitest'
import { validateProfileSuggestion } from './route'

describe('AI import profile suggestion validation', () => {
  const headers = ['Date', 'Band', 'Net Revenue']

  it('keeps only field names and real column headings', () => {
    expect(validateProfileSuggestion({
      profile_name: 'A',
      field_mapping: {
        artist_name: 'Band',
        net_revenue: 'Net Revenue',
        sales_month: 'Not a real header',
        malicious: 'Date',
      },
      question: 'Is Date the reporting period?',
    }, headers)).toMatchObject({
      field_mapping: { artist_name: 'Band', net_revenue: 'Net Revenue' },
      question: 'Is Date the reporting period?',
    })
  })

  it('does not accept duplicate source columns', () => {
    expect(validateProfileSuggestion({
      field_mapping: { artist_name: 'Date', net_revenue: 'Date' },
    }, headers).field_mapping).toEqual({ artist_name: 'Date' })
  })
})
