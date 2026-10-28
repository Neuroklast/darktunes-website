'use client'
import { useState } from 'react'
import Link from 'next/link'

export function ReviewMcpNewsDraft({ token, action }: {
  token: string
  action: string
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function approve() {
    if (busy || saved) return
    setBusy(true)
    try {
      const isNews = action === 'create_cms_news_draft'
      const response = await fetch(
        isNews ? '/mcp/news-draft-approvals' : '/mcp/content-approvals', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isNews ? { token } : { token, action }),
        },
      )
      const json = await response.json() as { detail?: string; error?: string }
      if (!response.ok) {
        setResult(json.detail ?? json.error ?? 'This change could not be approved.')
      } else {
        setSaved(true)
        setResult(json.detail ?? 'The CMS change was saved.')
      }
    } catch {
      setResult('The browser could not contact the darkTunes approval endpoint.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      {!saved ? (
        <button type="button" onClick={() => void approve()} disabled={busy}
          className="rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50">
          {busy ? 'Saving…' : action === 'create_cms_news_draft' ? 'Approve and save draft' : 'Approve and apply changes'}
        </button>
      ) : null}
      <Link href="/admin" className="underline text-sm">Back to admin</Link>
      {result ? <p className={saved ? 'text-sm' : 'text-sm text-destructive'} role="status">{result}</p> : null}
    </div>
  )
}
