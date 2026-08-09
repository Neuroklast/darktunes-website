import type { Metadata } from 'next'
import { OnboardingRegisterClient } from './_components/OnboardingRegisterClient'

export const metadata: Metadata = {
  title: 'Start your label ÔÇö darkTunes SaaS',
  description: 'Register a new music label on darkTunes and choose a subscription plan.',
}

export default function OnboardingPage() {
  return (
    <main id="main-content" className="mx-auto max-w-lg px-4 py-16">
      <OnboardingRegisterClient />
    </main>
  )
}
