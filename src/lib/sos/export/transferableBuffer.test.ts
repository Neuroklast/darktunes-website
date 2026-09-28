import { describe, expect, it, vi } from 'vitest'
import { postWithTransferFallback, toTransferableArrayBuffer } from './transferableBuffer'

describe('toTransferableArrayBuffer', () => {
  it('converts a Uint8Array into an ArrayBuffer that structuredClone can transfer', () => {
    const view = new Uint8Array([80, 75, 3, 4])
    const buffer = toTransferableArrayBuffer(view)
    expect(Object.prototype.toString.call(buffer)).toBe('[object ArrayBuffer]')
    expect(buffer).not.toBe(view.buffer)
    const cloned = structuredClone({ buffer }, { transfer: [buffer] })
    expect(Array.from(new Uint8Array(cloned.buffer))).toEqual([80, 75, 3, 4])
  })

  it('copies an ArrayBuffer so the result can be transferred', () => {
    const original = new Uint8Array([1, 2, 3]).buffer
    const copy = toTransferableArrayBuffer(original)
    expect(Object.prototype.toString.call(copy)).toBe('[object ArrayBuffer]')
    expect(copy).not.toBe(original)
    expect(Array.from(new Uint8Array(copy))).toEqual([1, 2, 3])
  })
})

describe('postWithTransferFallback', () => {
  it('sends with the buffer in the transfer list on the happy path', () => {
    const send = vi.fn()
    const buffer = new Uint8Array([1, 2, 3]).buffer
    const msg = { type: 'excel-done', buffer }
    postWithTransferFallback(send, msg, buffer)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(msg, [buffer])
  })

  it('retries without a transfer list when the transfer throws DataCloneError', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer
    const msg = { type: 'excel-done', buffer }
    const send = vi.fn((_msg: typeof msg, transfer?: Transferable[]) => {
      if (transfer) {
        throw new DOMException('Value at index 0 does not have a transferable type.', 'DataCloneError')
      }
    })
    expect(() => postWithTransferFallback(send, msg, buffer)).not.toThrow()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(1, msg, [buffer])
    expect(send).toHaveBeenNthCalledWith(2, msg)
  })
})
