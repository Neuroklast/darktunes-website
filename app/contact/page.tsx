/**
 * app/contact/page.tsx — Contact page [RSC]
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { ContactForm } from './_components/ContactForm'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Contact', labelName),
    description: `Get in touch with ${labelName}.`,
  }
}

export default async function ContactPage() {
  const orgId = await getRequestOrganizationId()
  const [tPages, tContact, settings] = await Promise.all([
    getTranslations('pages'),
    getTranslations('contact'),
    getCachedSiteSettings(orgId).catch(() => null),
  ])
  const submitHubUrl = settings?.submitHubUrl || ''
  const submitHubHeading = settings?.submitHubSectionHeading || tContact('submitMusicHeading')
  const submitHubDescription = settings?.submitHubDescription || tContact('submitMusicDescription')
  const submitHubButtonLabel = settings?.submitHubLabel || tContact('submitMusicButton')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-4xl">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-accent transition-colors mb-8 inline-block"
        >
          {tPages('backToHome')}
        </Link>

        <div className="mb-12">
          <h1 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight uppercase">
            {tContact('heading')}
          </h1>
          <p className="text-xl text-muted-foreground font-serif">{tContact('subheading')}</p>
        </div>

        {/* Contact form */}
        <section className="mb-14 rounded-xl border border-border bg-card/40 p-8">
          <ContactForm contactTopics={settings?.contactTopics ?? []} />
        </section>

        {/* Submit Music section */}
        <section className="rounded-xl border border-primary/30 bg-card/60 p-8 space-y-4">
          <h2 className="text-2xl font-bold uppercase tracking-wider">{submitHubHeading}</h2>
          <p className="text-muted-foreground font-serif leading-relaxed">
            {submitHubDescription}
          </p>
          <a
            href={submitHubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-bold uppercase tracking-wider hover:bg-primary/90 transition-all hover:scale-105"
          >
            {submitHubButtonLabel}
            <ArrowSquareOut size={18} weight="bold" />
          </a>
        </section>
      </div>
    </div>
  )
}