import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExcelExportDialog } from './ExcelExportDialog'
import {
  DEFAULT_EXCEL_EXPORT_STATE,
  normalizeExcelExportSettings,
} from '@/lib/sos/excelExportSettings'

vi.mock('next-intl', () => ({
  useMessages: () => ({ admin: { accounting: {} } }),
}))

describe('ExcelExportDialog', () => {
  it('applies column changes and confirms the current settings', () => {
    const onStateChange = vi.fn()
    const onConfirm = vi.fn()

    render(
      <ExcelExportDialog
        open
        onOpenChange={vi.fn()}
        state={DEFAULT_EXCEL_EXPORT_STATE}
        onStateChange={onStateChange}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByLabelText('UPC / EAN'))
    expect(onStateChange).toHaveBeenCalled()
    const nextState = onStateChange.mock.calls.at(-1)?.[0]
    expect(nextState.settings.columns['releases.upcEan']).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
    expect(onConfirm).toHaveBeenCalledWith(DEFAULT_EXCEL_EXPORT_STATE.settings)
  })

  it('requires a name before saving a preset', () => {
    const onStateChange = vi.fn()
    render(
      <ExcelExportDialog
        open
        onOpenChange={vi.fn()}
        state={{
          ...DEFAULT_EXCEL_EXPORT_STATE,
          settings: normalizeExcelExportSettings({ columns: { 'releases.upcEan': false } }),
        }}
        onStateChange={onStateChange}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save as…' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a preset name first.')
    expect(onStateChange).not.toHaveBeenCalled()
  })
})
