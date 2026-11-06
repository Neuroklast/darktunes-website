import { describe, expect, it } from 'vitest'
import { fingerprintHeaders, parseImportSample, readImportSample } from './importSample'

describe('sample-only import detection', () => {
  it('extracts headers and exactly the first three data rows', () => {
    const csv = ['Artist;Net Revenue;Date', 'Alpha;12,50;Q2 2026',
      'Beta;4,00;Q2 2026', 'Gamma;3,00;Q3 2026', 'Delta;100;Q3 2026'].join('\n')
    const result = parseImportSample(csv)
    expect(result.headers).toEqual(['Artist', 'Net Revenue', 'Date'])
    expect(result.delimiter).toBe(';')
    expect(result.sampleRows).toHaveLength(3)
    expect(result.sampleRows.flat()).not.toContain('Delta')
  })

  it('handles quoted fields and limits sample cell size', () => {
    const result = parseImportSample('Band,Amount\n"Artist, A","2,50"')
    expect(result.sampleRows[0]).toEqual(['Artist, A', '2,50'])
    expect(result.sampleRows[0]).toHaveLength(2)
  })

  it('normalizes signatures without using sample values', () => {
    expect(fingerprintHeaders(['NET REVENUE', ' Date '])).toBe(fingerprintHeaders(['date', 'net revenue']))
    expect(fingerprintHeaders(['NET', 'Date'])).not.toBe(fingerprintHeaders(['NET REVENUE', 'Date']))
  })

  it('reads only a slice of a CSV even if the file is much larger', async () => {
    const file = new File(['Date,Band,Net Revenue\nQ2 2026,A,2\n'], 'export.csv')
    Object.defineProperty(file, 'arrayBuffer', { value: () => { throw new Error('whole file read') } })
    expect((await readImportSample(file)).sampleRows).toEqual([['Q2 2026', 'A', '2']])
  })
})
