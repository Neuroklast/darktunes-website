import type { Metadata } from 'next'
import { AssistantMount } from '@/components/ai/AssistantMount'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Editor', labelName),
    robots: { index: false, follow: false },
  }
}

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AssistantMount dashboard="editor" />
    </>
  )
}