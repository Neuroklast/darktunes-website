'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { Organization } from '@/lib/api/organizations'

async function getToken(): Promise<string> {
  const session = await createBrowserSupabaseClient().auth.getSession()
  return session.data.session?.access_token ?? ''
}

export function OrganizationsManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrgId, setSelectedOrgId] = useState(DEFAULT_ORGANIZATION_ID)
  const [apiKeyName, setApiKeyName] = useState('Believe Integration')
  const [newDomain, setNewDomain] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const fetchOrganizations = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/organizations', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load organizations')
      const data = (await res.json()) as Organization[]
      setOrganizations(data)
    } catch {
      toast.error('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchOrganizations()
  }, [fetchOrganizations])

  const createApiKey = async () => {
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/organization-api-keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizationId: selectedOrgId, name: apiKeyName }),
      })
      if (!res.ok) throw new Error('Failed to create API key')
      const data = (await res.json()) as { key: string }
      setCreatedKey(data.key)
      toast.success('Partner API key created — copy it now, it will not be shown again.')
    } catch {
      toast.error('Failed to create API key')
    }
  }

  const addCustomDomain = async () => {
    if (!newDomain.trim()) return
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/custom-domains', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizationId: selectedOrgId, domain: newDomain.trim() }),
      })
      if (!res.ok) throw new Error('Failed to add domain')
      const domain = (await res.json()) as { verificationToken: string; domain: string }
      toast.success(`Add TXT record: ${domain.verificationToken}`)
      setNewDomain('')
    } catch {
      toast.error('Failed to add custom domain')
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading organizations…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organizations (SaaS)</h1>
        <p className="text-sm text-muted-foreground">
          Multi-tenant labels, partner API keys, and custom domains.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted/40 ${
                selectedOrgId === org.id ? 'border-primary' : 'border-border'
              }`}
              onClick={() => setSelectedOrgId(org.id)}
            >
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-xs text-muted-foreground">{org.slug}.darktunes.app</p>
              </div>
              <Badge variant={org.status === 'active' ? 'default' : 'secondary'}>{org.status}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Partner API Key (v1)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="api-key-name">Key name</Label>
            <Input
              id="api-key-name"
              value={apiKeyName}
              onChange={(e) => setApiKeyName(e.target.value)}
            />
          </div>
          <Button onClick={() => void createApiKey()}>Generate API Key</Button>
          {createdKey && (
            <p className="rounded-md border border-border bg-muted/30 p-3 font-mono text-xs break-all">
              {createdKey}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Domain</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            placeholder="label.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="max-w-sm"
            aria-label="Custom domain"
          />
          <Button variant="outline" onClick={() => void addCustomDomain()}>
            Add domain
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}