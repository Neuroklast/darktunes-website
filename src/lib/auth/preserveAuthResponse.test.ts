import type { NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { preserveAuthResponse } from './preserveAuthResponse'

describe('preserveAuthResponse', () => {
  it('copies token-rotation and deletion cookies plus anti-cache headers', () => {
    const cookies = [
      { name: 'sb-session', value: 'rotated', path: '/', sameSite: 'lax' },
      { name: 'sb-stale', value: '', path: '/', maxAge: 0 },
    ]
    const source = {
      cookies: { getAll: vi.fn(() => cookies) },
      headers: new Headers({
        'cache-control': 'private, no-store',
        expires: '0',
        pragma: 'no-cache',
      }),
    } as unknown as NextResponse
    const setAll = vi.fn()
    const redirect = {
      cookies: { setAll },
      headers: new Headers(),
    } as unknown as NextResponse

    expect(preserveAuthResponse(source, redirect)).toBe(redirect)
    expect(setAll).toHaveBeenCalledWith(cookies)
    expect(redirect.headers.get('cache-control')).toBe('private, no-store')
    expect(redirect.headers.get('pragma')).toBe('no-cache')
    expect(redirect.headers.get('expires')).toBe('0')
  })

  it('preserves unrelated redirect headers', () => {
    const source = {
      cookies: { getAll: () => [] },
      headers: new Headers(),
    } as unknown as NextResponse
    const redirect = {
      cookies: { setAll: vi.fn() },
      headers: new Headers({ location: 'https://darktunes.com/login' }),
    } as unknown as NextResponse

    preserveAuthResponse(source, redirect)
    expect(redirect.headers.get('location')).toBe('https://darktunes.com/login')
  })
})
