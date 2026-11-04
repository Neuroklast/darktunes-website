import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'
import { vi } from 'vitest'
import { mockNextIntl } from './mockNextIntl'

vi.mock('next-intl', () => mockNextIntl)

// jsdom exposes crypto.subtle in CI but it may not digest buffers; use Node Web Crypto.
const testCrypto = webcrypto as Crypto
Object.defineProperty(globalThis, 'crypto', {
  value: testCrypto,
  writable: true,
  configurable: true,
})
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    value: testCrypto,
    writable: true,
    configurable: true,
  })
}

// Test-only encryption master key (32 bytes hex). Never use in production.
if (!process.env.API_CREDENTIALS_ENCRYPTION_KEY) {
  process.env.API_CREDENTIALS_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
}

// jsdom < 27 does not implement Blob.prototype.arrayBuffer/text (added in jsdom
// 27). Real browsers and Node provide them. jsdom 26 is pinned because jsdom 27+
// pulls ESM-only deps that crash Next's external require() on Vercel.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  const readBlob = (blob: Blob, as: 'arrayBuffer' | 'text') =>
    new Promise<ArrayBuffer | string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer | string)
      reader.onerror = () => reject(reader.error ?? new Error('Blob read failed'))
      if (as === 'arrayBuffer') reader.readAsArrayBuffer(blob)
      else reader.readAsText(blob)
    })
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return readBlob(this, 'arrayBuffer') as Promise<ArrayBuffer>
  }
  Blob.prototype.text = function text(this: Blob) {
    return readBlob(this, 'text') as Promise<string>
  }
}

// jsdom does not always provide a functional localStorage in Node 22+.
if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
      clear: () => { store.clear() },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size },
    },
    writable: true,
  })
}
