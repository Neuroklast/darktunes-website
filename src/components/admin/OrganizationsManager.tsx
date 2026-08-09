'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollPanel } from '@/components/ui/scroll-panel'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { Organization } from '@/lib/api/organizations'
import type { OrganizationWebhookEndpoint } from '@/lib/api/organizationWebhooks'
import type { CustomDomain } from '@/lib/api/customDomains'
import type { AuditLogEntry } from '@/lib/api/organizationAuditLog'

const DEFAULT_WEBHOOK_EVENTS = [
  'release.submitted',
  'release.approved',
  'release.rejected',
  'artist.created',
] as const

async function getToken(): Promise<string> {
  const session = await createBrowserSupabaseClient().auth.getSession()
  return session.data.session?.access_token ?? ''
}

export function OrganizationsManager() {
  const tToast = useTranslations('admin.toast')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrgId, setSelectedOrgId] = useState(DEFAULT_ORGANIZATION_ID)
  const [apiKeyName, setApiKeyName] = useState('Believe Integration')
  const [newDomain, setNewDomain] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEndpoints, setWebhookEndpoints] = useState<OrganizationWebhookEndpoint[]>([])
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null)
  const [customDomains, setCustomDomains] = useState<CustomDomain[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])

  const fetchOrganizations = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/organizations', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as Organization[]
      setOrganizations(data)
    } catch {
      toast.error(tToast('failed_load_organizations'))
    } finally {
      setLoading(false)
    }
  }, [tToast])

  const fetchWebhookEndpoints = useCallback(async (orgId: string) => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/organization-webhooks?organizationId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load webhooks')
      const data = (await res.json()) as OrganizationWebhookEndpoint[]
      setWebhookEndpoints(data)
    } catch {
      setWebhookEndpoints([])
    }
  }, [])

  useEffect(() => {
    void fetchOrganizations()
  }, [fetchOrganizations])

  const fetchCustomDomains = useCallback(async (orgId: string) => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/custom-domains?organizationId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load domains')
      setCustomDomains((await res.json()) as CustomDomain[])
    } catch {
      setCustomDomains([])
    }
  }, [])

  const fetchAuditLogs = useCallback(async (orgId: string) => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/organization-audit-log?organizationId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load audit log')
      setAuditLogs((await res.json()) as AuditLogEntry[])
    } catch {
      setAuditLogs([])
    }
  }, [])

  useEffect(() => {
    void fetchWebhookEndpoints(selectedOrgId)
    void fetchCustomDomains(selectedOrgId)
    void fetchAuditLogs(selectedOrgId)
  }, [selectedOrgId, fetchWebhookEndpoints, fetchCustomDomains, fetchAuditLogs])

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
      if (!res.ok) throw new Error('create failed')
      const data = (await res.json()) as { key: string }
      setCreatedKey(data.key)
      toast.success(tToast('partner_api_key_created'))
    } catch {
      toast.error(tToast('failed_create_api_key'))
    }
  }

  const createWebhookEndpoint = async () => {
    if (!webhookUrl.trim()) return
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/organization-webhooks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          url: webhookUrl.trim(),
          events: [...DEFAULT_WEBHOOK_EVENTS],
        }),
      })
      if (!res.ok) throw new Error('create failed')
      const data = (await res.json()) as { secret: string }
      setCreatedWebhookSecret(data.secret)
      setWebhookUrl('')
      toast.success(tToast('webhook_endpoint_created'))
      void fetchWebhookEndpoints(selectedOrgId)
    } catch {
      toast.error(tToast('failed_create_webhook'))
    }
  }

  const deleteWebhookEndpoint = async (id: string) => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/organization-webhooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('delete failed')
      toast.success(tToast('webhook_endpoint_removed'))
      void fetchWebhookEndpoints(selectedOrgId)
    } catch {
      toast.error(tToast('failed_delete_webhook'))
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
      if (!res.ok) throw new Error('add failed')
      const domain = (await res.json()) as { verificationToken: string; domain: string }
      toast.success(
        tToast('domain_txt_publish', { token: domain.verificationToken, domain: domain.domain }),
      )
      setNewDomain('')
      void fetchCustomDomains(selectedOrgId)
    } catch {
      toast.error(tToast('failed_add_custom_domain'))
    }
  }

  const verifyCustomDomain = async (domainId: string) => {
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/custom-domains/verify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domainId }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(errBody.error ?? errBody.message ?? 'Verification failed')
      }
      toast.success(tToast('domain_verified_dns'))
      void fetchCustomDomains(selectedOrgId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('failed_verify_domain'))
    }
  }

  const exportOrganizationData = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/organizations/${selectedOrgId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `org-export-${selectedOrgId}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(tToast('organization_data_exported'))
      void fetchAuditLogs(selectedOrgId)
    } catch {
      toast.error(tToast('failed_export_organization'))
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
          <CardTitle>Outbound Webhooks (v1)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Receiver URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://partner.example.com/webhooks/darktunes"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Events: {DEFAULT_WEBHOOK_EVENTS.join(', ')}. Signed with X-DarkTunes-Signature.
            </p>
          </div>
          <Button variant="outline" onClick={() => void createWebhookEndpoint()}>
            Add webhook endpoint
          </Button>
          {createdWebhookSecret && (
            <p className="rounded-md border border-border bg-muted/30 p-3 font-mono text-xs break-all">
              Signing secret: {createdWebhookSecret}
            </p>
          )}
          {webhookEndpoints.length > 0 && (
            <ul className="space-y-2" aria-label="Webhook endpoints">
              {webhookEndpoints.map((endpoint) => (
                <li
                  key={endpoint.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{endpoint.url}</p>
                    <p className="text-xs text-muted-foreground">{endpoint.events.join(', ')}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteWebhookEndpoint(endpoint.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Domains</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add a TXT record with the verification value, then run Check DNS. After verification, point CNAME/ALIAS
            traffic to the platform tenant host.
          </p>
          <div className="flex flex-wrap gap-2">
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
          </div>
          {customDomains.length > 0 && (
            <ul className="space-y-2" aria-label="Custom domains">
              {customDomains.map((domain) => (
                <li
                  key={domain.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{domain.domain}</p>
                    <p className="text-xs text-muted-foreground">Status: {domain.status}</p>
                    {domain.status === 'pending' && (
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        TXT: {domain.verificationToken}
                        <br />
                        Hosts: {domain.domain} or _darktunes-verify.{domain.domain}
                      </p>
                    )}
                  </div>
                  {domain.status === 'pending' && (
                    <Button variant="ghost" size="sm" onClick={() => void verifyCustomDomain(domain.id)}>
                      Check DNS
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Log & GDPR Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => void exportOrganizationData()}>
            Export organization data (JSON)
          </Button>
          {auditLogs.length > 0 && (
            <ScrollPanel className="max-h-64" aria-label="Audit log">
              <ul className="space-y-2 text-sm">
                {auditLogs.map((entry) => (
                  <li key={entry.id} className="rounded-md border border-border px-3 py-2">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-muted-foreground"> · {new Date(entry.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </ScrollPanel>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
