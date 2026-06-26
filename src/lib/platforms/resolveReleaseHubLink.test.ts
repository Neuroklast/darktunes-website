import { describe, it, expect } from 'vitest'
import { resolveReleaseHubLink, resolveReleaseHubLinkLabelKey } from './resolveReleaseHubLink'

describe('resolveReleaseHubLink', () => {
  it('prefers manual smartlinkUrl over Odesli smartUrl', () => {
    expect(
      resolveReleaseHubLink({
        smartlinkUrl: 'https://linktr.ee/artist',
        smartUrl: 'https://song.link/s/abc',
      }),
    ).toBe('https://linktr.ee/artist')
  })

  it('falls back to smartUrl when smartlinkUrl is empty', () => {
    expect(
      resolveReleaseHubLink({
        smartlinkUrl: '',
        smartUrl: 'https://song.link/s/abc',
      }),
    ).toBe('https://song.link/s/abc')
  })

  it('falls back to platform_links hub keys', () => {
    expect(
      resolveReleaseHubLink({
        platformLinks: {
          spotify: 'https://open.spotify.com/album/sp',
          songlink: 'https://song.link/s/def',
        },
      }),
    ).toBe('https://song.link/s/def')
  })

  it('returns undefined when no hub link exists', () => {
    expect(resolveReleaseHubLink({})).toBeUndefined()
  })
})

describe('resolveReleaseHubLinkLabelKey', () => {
  it('uses smartLink label for manual smartlinkUrl', () => {
    expect(resolveReleaseHubLinkLabelKey({ smartlinkUrl: 'https://linktr.ee/x' })).toBe('smartLink')
  })

  it('uses listenEverywhere label for Odesli-only hubs', () => {
    expect(resolveReleaseHubLinkLabelKey({ smartUrl: 'https://song.link/s/abc' })).toBe('listenEverywhere')
  })
})