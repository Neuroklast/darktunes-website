import { describe, expect, it } from 'vitest'
import { scrubSentryEvent } from './sentryOptions'

describe('scrubSentryEvent', () => {
  it('removes sensitive request headers', () => {
    const event = scrubSentryEvent({
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=1',
          'x-request-id': 'abc',
          'content-type': 'application/json',
        },
      },
    })
    expect(event.request?.headers?.authorization).toBeUndefined()
    expect(event.request?.headers?.cookie).toBeUndefined()
    expect(event.request?.headers?.['x-request-id']).toBe('abc')
    expect(event.request?.headers?.['content-type']).toBe('application/json')
  })
})
