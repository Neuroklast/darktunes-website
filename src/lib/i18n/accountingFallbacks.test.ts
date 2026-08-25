import { describe, expect, it } from 'vitest'
import { mergeAccountingLabels } from './accountingFallbacks'
import { interpolate } from './interpolate'

describe('mergeAccountingLabels', () => {
  it('keeps only string overrides so nested i18n maps cannot crash interpolate', () => {
    const labels = mergeAccountingLabels({
      tabHistory: 'Historie',
      workflowSteps: { draft: { label: 'Entwürfe' } },
    } as never)

    expect(labels.tabHistory).toBe('Historie')
    expect(typeof labels.tabGenerate).toBe('string')
    expect(interpolate(labels.settlementDraftsCreated, { count: 2 })).toContain('2')
  })
})
