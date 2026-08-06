import { describe, it, expect } from 'vitest'
import { PUBLIC_EPK_COLUMNS } from './publicArtistEpk'

describe('PUBLIC_EPK_COLUMNS', () => {
  it('never includes password hash', () => {
    expect(PUBLIC_EPK_COLUMNS).not.toContain('epk_password_hash')
    expect(PUBLIC_EPK_COLUMNS).not.toContain('password')
  })
})
