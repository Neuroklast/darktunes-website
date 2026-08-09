'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

export function OnboardingRegisterClient() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [planSlug, setPlanSlug] = useState<'starter' | 'professional' | 'business'>('starter')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Label name and slug are required')
      return
    }
    setLoading(true)
    try {
      const origin = window.location.origin
      const res = await fetch('/api/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          planSlug,
          billingInterval: 'month',
          successUrl: `${origin}/onboarding?success=1`,
          cancelUrl: `${origin}/onboarding?canceled=1`,
        }),
      })
      const data = (await res.json()) as { checkoutUrl?: string | null; error?: string; message?: string }
      if (!res.ok) throw new Error(data.error ?? 'Registration failed')
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      toast.success(data.message ?? 'Organization created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start your label</CardTitle>
        <p className="text-sm text-muted-foreground">
          Create a tenant on <span className="font-mono">{slug || 'your-slug'}.darktunes.app</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="label-name">Label name</Label>
          <Input id="label-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="label-slug">Subdomain slug</Label>
          <Input
            id="label-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
            placeholder="my-label"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan">Plan</Label>
          <Select value={planSlug} onValueChange={(v) => setPlanSlug(v as typeof planSlug)}>
            <SelectTrigger id="plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="w-full" onClick={() => void submit()} disabled={loading}>
          {loading ? 'CreatingÔÇª' : 'Continue to checkout'}
        </Button>
      </CardContent>
    </Card>
  )
}
