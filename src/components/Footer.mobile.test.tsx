import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { Footer } from './Footer'
import type { SiteSettings } from '@/types'

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}))

vi.mock('@/lib/pwa/installPrompt', () => ({
  requestPwaInstallPrompt: vi.fn(),
}))

const messages = {
  footer: {
    quickLinks: 'Quick Links',
    followUs: 'Follow',
    artistsLink: 'Artists',
    aboutLink: 'About',
    releasesLink: 'Releases',
    newsLink: 'News',
    videosLink: 'Videos',
    tourLink: 'Events',
    contactLink: 'Contact',
    submitMusicLink: 'Submit',
    shopLink: 'Shop',
    allRightsReserved: 'All rights reserved.',
    contact: 'Contact',
    privacyPolicy: 'Privacy Policy',
    legalNotice: 'Legal Notice',
    terms: 'Terms',
    installApp: 'Install app',
    legalNavAria: 'Legal and app links',
  },
}

const siteSettings = {
  labelName: 'darkTunes',
  labelTagline: 'Tagline',
  showAboutInFooter: true,
} as SiteSettings

describe('Footer mobile legal links', () => {
  it('exposes wrapping legal nav with 44px touch targets', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Footer siteSettings={siteSettings} />
      </NextIntlClientProvider>,
    )

    const nav = screen.getByRole('navigation', { name: 'Legal and app links' })
    expect(nav).toHaveClass('flex-wrap')

    const impressum = screen.getByRole('link', { name: 'Legal Notice' })
    expect(impressum).toHaveAttribute('href', '/impressum')
    expect(impressum.className).toMatch(/min-h-\[44px\]/)

    const privacy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(privacy).toHaveAttribute('href', '/datenschutz')
    expect(privacy.className).toMatch(/min-h-\[44px\]/)
  })
})
