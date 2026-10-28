import { getTranslations } from 'next-intl/server'
import { AdminPageShell } from '../_components/AdminPageShell'
import { requirePageCapability } from '@/lib/rbac/requireAdminPage'
import { AdminAiDashboard } from './_components/AdminAiDashboard'

export default async function AdminAiPage() {
  await requirePageCapability('admin.panel.full')
  const t = await getTranslations('ai')
  return (
    <AdminPageShell title={t('title')} description={t('pageDescription')}>
      <div className="mb-4"><a className="inline-flex rounded border border-zinc-700 px-4 py-2 text-sm" href="/admin/mcp-requests">AI / MCP editorial reviews</a></div>
      <AdminAiDashboard />
    </AdminPageShell>
  )
}
