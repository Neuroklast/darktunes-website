import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { LocaleFlagIcon } from './LocaleFlagIcon'

describe('LocaleFlagIcon', () => {
  it('renders SVG for each supported locale', () => {
    for (const locale of ['de', 'en', 'fr'] as const) {
      const { container } = render(<LocaleFlagIcon locale={locale} />)
      expect(container.querySelector('svg')).toBeTruthy()
    }
  })

  it('does not use emoji regional indicators', () => {
    const { container } = render(<LocaleFlagIcon locale="de" />)
    expect(container.textContent).not.toMatch(/🇩🇪|DE/)
  })
})
