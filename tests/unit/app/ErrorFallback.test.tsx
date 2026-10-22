import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorFallback } from '@/ErrorFallback'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { reference?: string }) =>
    values?.reference ? `${key}:${values.reference}` : key,
}))

vi.mock('@/lib/clientErrorReporter', () => ({
  reportClientError: vi.fn(),
}))

describe('ErrorFallback', () => {
  it('never renders the raw exception message', () => {
    render(
      <ErrorFallback
        error={new Error('SQL: select * from secrets where token = abc')}
        resetErrorBoundary={vi.fn()}
      />,
    )

    expect(screen.queryByText(/select \* from secrets/i)).toBeNull()
    expect(screen.queryByText(/token = abc/i)).toBeNull()
    expect(screen.getByText('ERROR_BOUNDARY_TITLE')).toBeTruthy()
    expect(screen.getByText('ERROR_BOUNDARY_RETRY')).toBeTruthy()
  })

  it('shows a digest as the support reference', () => {
    const error = Object.assign(new Error('boom'), { digest: 'ERR-DIGEST-123' })
    render(<ErrorFallback error={error} resetErrorBoundary={vi.fn()} />)

    expect(screen.queryByText(/boom/)).toBeNull()
    expect(screen.getByText(/ERR-DIGEST-123/)).toBeTruthy()
  })
})
