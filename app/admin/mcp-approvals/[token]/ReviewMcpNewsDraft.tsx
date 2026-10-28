'use client'
import { useState } from 'react'
import Link from 'next/link'

export function ReviewMcpNewsDraft({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function approve() {
    if (busy || saved) return
    setBusy(true)
    try {
      const response = await fetch('/mcp/news-draft-approvals', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await response.json() as { detail?: string; error?: string }
      if (!response.ok) {
        setResult(json.error ?? 'Unable to save draft.')
      } else {
        setSaved(true)
        setResult(json.detail ?? 'Draft saved.')
      }
    } catch {
      setResult('Unable to save draft.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {!saved ? (
        <button type="button" onClick={() => void approve()} disabled={busy}
          className="rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50">
          {busy ? 'Saving…' : 'Approve and save draft'}
        </button>
      ) : null}
      <Link href="/admin/news" className="underline text-sm">Back to news</Link>
      {result ? <p className={saved ? 'text-sm' : 'text-sm text-destructive'} role="status">{result}</p> : null}
    </div>
  )
}
