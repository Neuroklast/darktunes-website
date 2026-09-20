'use client'

/**
 * src/components/admin/LogsManager.tsx
 *
 * Admin log viewer with five tabs:
 *   1. Sync Log     — all sync_logs entries
 *   2. Sync Errors  — sync_logs with status partial/error
 *   3. App Errors   — app_logs entries (UI, R2, upload, Vercel, Supabase errors)
 *   4. RBAC Audit   — rbac_audit_log (role/permission changes)
 *   5. Admin Actions — admin_audit_log (general admin actions)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Warning,
  CheckCircle,
  XCircle,
  MagnifyingGlass,
  Info,
} from '@phosphor-icons/react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  ADMIN_TABLE_PAGE_SIZE,
  AdminDataTable,
  AdminTablePagination,
  useAdminTable,
} from '@/components/admin/DataTable'
import type { Database } from '@/types/database'

type RbacAuditRow = Database['public']['Tables']['rbac_audit_log']['Row']
type AdminAuditRow = Database['public']['Tables']['admin_audit_log']['Row']
type SyncLogRow = Database['public']['Tables']['sync_logs']['Row']
type AppLogRow = Database['public']['Tables']['app_logs']['Row']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === 'success') {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
        <CheckCircle size={10} weight="fill" aria-hidden="true" />
        success
      </Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
        <Warning size={10} weight="fill" aria-hidden="true" />
        partial
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
      <XCircle size={10} weight="fill" aria-hidden="true" />
      error
    </Badge>
  )
}

function AppLevelBadge({ level }: { level: string }) {
  if (level === 'info') {
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
        <Info size={10} weight="fill" aria-hidden="true" />
        info
      </Badge>
    )
  }
  if (level === 'warn') {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
        <Warning size={10} weight="fill" aria-hidden="true" />
        warn
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
      <XCircle size={10} weight="fill" aria-hidden="true" />
      error
    </Badge>
  )
}

function parseErrors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
}

const RBAC_ACTION_LABELS: Record<string, string> = {
  permission_change: 'Permission change',
  custom_role_created: 'Custom role created',
  custom_role_updated: 'Custom role updated',
  custom_role_deleted: 'Custom role deleted',
  custom_permission_created: 'Custom permission created',
  custom_permission_updated: 'Custom permission updated',
  custom_permission_deleted: 'Custom permission deleted',
}

function useManualPagination() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ADMIN_TABLE_PAGE_SIZE,
  })
  const resetPage = useCallback(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [])
  return { pagination, setPagination, resetPage }
}

interface SyncLogsPanelProps {
  errorsOnly?: boolean
}

function SyncLogsPanel({ errorsOnly = false }: SyncLogsPanelProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [logs, setLogs] = useState<SyncLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('all')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const { pagination, setPagination, resetPage } = useManualPagination()

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('sync_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(
          pagination.pageIndex * ADMIN_TABLE_PAGE_SIZE,
          pagination.pageIndex * ADMIN_TABLE_PAGE_SIZE + ADMIN_TABLE_PAGE_SIZE - 1,
        )

      if (errorsOnly) {
        query = query.in('status', ['partial', 'error'])
      }
      if (source && source !== 'all') {
        query = query.eq('api_source', source)
      }
      if (search.trim()) {
        query = query.or(
          `message.ilike.%${search.trim()}%,api_source.ilike.%${search.trim()}%`,
        )
      }

      const { data, count, error } = await query
      if (error) throw error
      setLogs(data ?? [])
      setTotal(count ?? 0)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [supabase, pagination.pageIndex, errorsOnly, source, search])

  useEffect(() => {
    resetPage()
  }, [search, source, resetPage])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const columns = useMemo<ColumnDef<SyncLogRow>[]>(() => {
    const base: ColumnDef<SyncLogRow>[] = [
      {
        accessorKey: 'created_at',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'api_source',
        header: 'API',
        cell: ({ row }) => (
          <span className="text-xs font-mono uppercase">{row.original.api_source}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <SyncStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'releases_synced',
        header: 'Releases synced',
        cell: ({ row }) => <span className="text-xs">{row.original.releases_synced}</span>,
      },
      {
        accessorKey: 'rate_limited',
        header: 'Rate limited',
        cell: ({ row }) =>
          row.original.rate_limited ? (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Yes</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ]

    if (errorsOnly) {
      base.push({
        id: 'errors',
        header: 'Errors',
        cell: ({ row }) => {
          const errors = parseErrors(row.original.errors)
          const isExpanded = expandedRow === row.original.id
          if (errors.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <button
              type="button"
              onClick={() => setExpandedRow(isExpanded ? null : row.original.id)}
              className="text-xs text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              {isExpanded ? 'Hide' : `${errors.length} error(s)`}
            </button>
          )
        },
      })
    }

    return base
  }, [errorsOnly, expandedRow])

  const table = useAdminTable({
    data: logs,
    columns,
    enableSorting: false,
    getRowId: (row) => row.id,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_TABLE_PAGE_SIZE)),
    rowCount: total,
    onPaginationChange: setPagination,
    state: { pagination },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <MagnifyingGlass
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search message or API…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-8 w-[150px] text-sm">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="itunes">iTunes</SelectItem>
            <SelectItem value="spotify">Spotify</SelectItem>
            <SelectItem value="discogs">Discogs</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="odesli">Odesli</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminTablePagination
        pageIndex={pagination.pageIndex}
        totalCount={total}
        onPageChange={(pageIndex) => setPagination((prev) => ({ ...prev, pageIndex }))}
      />

      <AdminDataTable
        table={table}
        loading={loading}
        renderSubRow={
          errorsOnly
            ? (row) => {
                const errors = parseErrors(row.original.errors)
                const isExpanded = expandedRow === row.original.id
                if (!isExpanded || errors.length === 0) return null
                return (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="bg-destructive/5 pb-3 pt-0">
                      <ul className="space-y-1 pl-2">
                        {errors.map((err, i) => (
                          <li
                            key={i}
                            className="text-xs text-destructive font-mono break-all bg-destructive/10 rounded px-2 py-1"
                          >
                            {err}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )
              }
            : undefined
        }
      />
    </div>
  )
}

function AppLogsPanel() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [logs, setLogs] = useState<AppLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('all')
  const [level, setLevel] = useState('all')
  const [userErrorsOnly, setUserErrorsOnly] = useState(false)
  const [unresolvedOnly, setUnresolvedOnly] = useState(false)
  const [hideIgnored, setHideIgnored] = useState(true)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const { pagination, setPagination, resetPage } = useManualPagination()

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('app_logs')
        .select('*', { count: 'exact' })
        .order('last_seen_at', { ascending: false })
        .range(
          pagination.pageIndex * ADMIN_TABLE_PAGE_SIZE,
          pagination.pageIndex * ADMIN_TABLE_PAGE_SIZE + ADMIN_TABLE_PAGE_SIZE - 1,
        )

      if (source && source !== 'all') {
        query = query.eq('source', source)
      }
      if (level && level !== 'all') {
        query = query.eq('level', level as 'error' | 'warn' | 'info')
      }
      if (search.trim()) {
        query = query.or(
          `message.ilike.%${search.trim()}%,source.ilike.%${search.trim()}%`,
        )
      }
      if (userErrorsOnly) {
        query = query.not('user_id', 'is', null)
      }
      if (unresolvedOnly) {
        query = query.eq('resolved', false)
      }
      if (hideIgnored) {
        query = query.eq('ignored', false)
      }

      const { data, count, error } = await query
      if (error) throw error
      setLogs(data ?? [])
      setTotal(count ?? 0)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [supabase, pagination.pageIndex, source, level, search, userErrorsOnly, unresolvedOnly, hideIgnored])

  const updateLog = useCallback(
    async (id: string, patch: { resolved?: boolean; ignored?: boolean }) => {
      setMutatingId(id)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const res = await fetch(`/api/admin/app-logs/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error('Failed to update log entry')
        await fetchLogs()
      } catch {
        // Best-effort — the table simply keeps its previous state
      } finally {
        setMutatingId(null)
      }
    },
    [supabase, fetchLogs],
  )

  useEffect(() => {
    resetPage()
  }, [search, source, level, userErrorsOnly, unresolvedOnly, hideIgnored, resetPage])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const columns = useMemo<ColumnDef<AppLogRow>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => <span className="text-xs font-mono">{row.original.source}</span>,
      },
      {
        accessorKey: 'level',
        header: 'Level',
        cell: ({ row }) => <AppLevelBadge level={row.original.level} />,
      },
      {
        accessorKey: 'occurrences',
        header: 'Count',
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.occurrences}</span>
        ),
      },
      {
        accessorKey: 'first_seen_at',
        header: 'First seen',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.first_seen_at)}
          </span>
        ),
      },
      {
        accessorKey: 'user_id',
        header: 'User',
        cell: ({ row }) => {
          const userId = row.original.user_id
          if (!userId) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <Link
              href={`/admin/users/${userId}`}
              className="text-xs font-mono text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {userId.slice(0, 8)}…
            </Link>
          )
        },
      },
      {
        accessorKey: 'message',
        header: 'Message',
        cell: ({ row }) => (
          <span className="text-xs max-w-xs truncate">{row.original.message}</span>
        ),
      },
      {
        id: 'details',
        header: 'Details',
        cell: ({ row }) => {
          const hasDetails =
            row.original.details &&
            typeof row.original.details === 'object' &&
            Object.keys(row.original.details).length > 0
          const isExpanded = expandedRow === row.original.id
          if (!hasDetails) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <button
              type="button"
              onClick={() => setExpandedRow(isExpanded ? null : row.original.id)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {isExpanded ? 'Hide' : 'Show'}
            </button>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const entry = row.original
          if (entry.ignored) {
            return (
              <Badge variant="outline" className="text-xs">
                Ignored
              </Badge>
            )
          }
          if (entry.resolved) {
            return (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                Resolved
              </Badge>
            )
          }
          return (
            <Badge variant="outline" className="text-xs">
              Open
            </Badge>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const entry = row.original
          const busy = mutatingId === entry.id
          return (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateLog(entry.id, { resolved: !entry.resolved })}
                className="text-xs underline underline-offset-2 hover:text-foreground disabled:opacity-50"
              >
                {entry.resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateLog(entry.id, { ignored: !entry.ignored })}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
              >
                {entry.ignored ? 'Unignore' : 'Ignore'}
              </button>
            </div>
          )
        },
      },
    ],
    [expandedRow, mutatingId, updateLog],
  )

  const table = useAdminTable({
    data: logs,
    columns,
    enableSorting: false,
    getRowId: (row) => row.id,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_TABLE_PAGE_SIZE)),
    rowCount: total,
    onPaginationChange: setPagination,
    state: { pagination },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <MagnifyingGlass
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search message or source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-8 w-[140px] text-sm">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="r2">R2 / Storage</SelectItem>
            <SelectItem value="supabase">Supabase</SelectItem>
            <SelectItem value="upload">Upload</SelectItem>
            <SelectItem value="ui">UI</SelectItem>
            <SelectItem value="api">API</SelectItem>
            <SelectItem value="server_action">Server Actions</SelectItem>
            <SelectItem value="vercel">Vercel</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={userErrorsOnly}
            onChange={(e) => setUserErrorsOnly(e.target.checked)}
            className="rounded border-border"
          />
          User errors only
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(e) => setUnresolvedOnly(e.target.checked)}
            className="rounded border-border"
          />
          Unresolved only
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideIgnored}
            onChange={(e) => setHideIgnored(e.target.checked)}
            className="rounded border-border"
          />
          Hide ignored
        </label>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminTablePagination
        pageIndex={pagination.pageIndex}
        totalCount={total}
        onPageChange={(pageIndex) => setPagination((prev) => ({ ...prev, pageIndex }))}
      />

      <AdminDataTable
        table={table}
        loading={loading}
        renderSubRow={(row) => {
          const hasDetails =
            row.original.details &&
            typeof row.original.details === 'object' &&
            Object.keys(row.original.details).length > 0
          const isExpanded = expandedRow === row.original.id
          if (!isExpanded || !hasDetails) return null
          return (
            <TableRow>
              <TableCell colSpan={columns.length} className="bg-muted/30 pb-3 pt-0">
                <pre className="text-xs font-mono break-all whitespace-pre-wrap bg-muted/50 rounded px-3 py-2">
                  {JSON.stringify(row.original.details, null, 2)}
                </pre>
              </TableCell>
            </TableRow>
          )
        }}
      />
    </div>
  )
}

function RbacAuditPanel() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [entries, setEntries] = useState<RbacAuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { pagination, setPagination, resetPage } = useManualPagination()

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const headers: HeadersInit = session?.access_token
        ? { Authorization: 'Bearer ' + session.access_token }
        : {}
      const params = new URLSearchParams({
        page: String(pagination.pageIndex),
        pageSize: String(ADMIN_TABLE_PAGE_SIZE),
      })
      const res = await fetch(`/api/admin/rbac-audit?${params.toString()}`, { headers })
      if (!res.ok) throw new Error('Failed to load RBAC audit log')
      const body = (await res.json()) as { data: RbacAuditRow[]; total: number }
      setEntries(body.data)
      setTotal(body.total)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [supabase, pagination.pageIndex])

  useEffect(() => {
    resetPage()
  }, [search, resetPage])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.target_type.toLowerCase().includes(q) ||
        (e.target_id ?? '').toLowerCase().includes(q),
    )
  }, [entries, search])

  const columns = useMemo<ColumnDef<RbacAuditRow>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {RBAC_ACTION_LABELS[row.original.action] ?? row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: 'target_type',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.target_type}</span>
        ),
      },
      {
        accessorKey: 'target_id',
        header: 'Target',
        cell: ({ row }) => (
          <span className="text-xs font-mono">{row.original.target_id ?? '—'}</span>
        ),
      },
      {
        id: 'changes',
        header: 'Changes',
        cell: ({ row }) => {
          const hasChanges = !!(row.original.old_value || row.original.new_value)
          const isExpanded = expanded === row.original.id
          if (!hasChanges) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setExpanded(isExpanded ? null : row.original.id)}
            >
              {isExpanded ? 'Hide' : 'Show'}
            </button>
          )
        },
      },
    ],
    [expanded],
  )

  const table = useAdminTable({
    data: filtered,
    columns,
    enableSorting: false,
    getRowId: (row) => row.id,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_TABLE_PAGE_SIZE)),
    rowCount: total,
    onPaginationChange: setPagination,
    state: { pagination },
  })

  return (
    <div className="space-y-4">
      <div className="relative">
        <MagnifyingGlass
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search action, target type, target id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <AdminTablePagination
        pageIndex={pagination.pageIndex}
        totalCount={total}
        onPageChange={(pageIndex) => setPagination((prev) => ({ ...prev, pageIndex }))}
      />

      <AdminDataTable
        table={table}
        loading={loading}
        emptyMessage="No RBAC audit entries found."
        renderSubRow={(row) => {
          const hasChanges = !!(row.original.old_value || row.original.new_value)
          const isExpanded = expanded === row.original.id
          if (!isExpanded || !hasChanges) return null
          return (
            <TableRow>
              <TableCell colSpan={columns.length} className="bg-muted/30 pb-3 pt-0">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {row.original.old_value && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                        Before
                      </p>
                      <pre className="text-xs font-mono bg-muted/50 rounded px-2 py-1.5 break-all whitespace-pre-wrap">
                        {JSON.stringify(row.original.old_value, null, 2)}
                      </pre>
                    </div>
                  )}
                  {row.original.new_value && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                        After
                      </p>
                      <pre className="text-xs font-mono bg-muted/50 rounded px-2 py-1.5 break-all whitespace-pre-wrap">
                        {JSON.stringify(row.original.new_value, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        }}
      />
    </div>
  )
}

function AdminActionsPanel() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [logs, setLogs] = useState<AdminAuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [resource, setResource] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { pagination, setPagination, resetPage } = useManualPagination()

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('admin_audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(
          pagination.pageIndex * ADMIN_TABLE_PAGE_SIZE,
          pagination.pageIndex * ADMIN_TABLE_PAGE_SIZE + ADMIN_TABLE_PAGE_SIZE - 1,
        )

      if (resource && resource !== 'all') query = query.eq('resource', resource)
      if (search.trim()) {
        query = query.or(
          `action.ilike.%${search.trim()}%,resource.ilike.%${search.trim()}%,resource_id.ilike.%${search.trim()}%`,
        )
      }

      const { data, count, error } = await query
      if (error) throw error
      setLogs(data ?? [])
      setTotal(count ?? 0)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [supabase, pagination.pageIndex, resource, search])

  useEffect(() => {
    resetPage()
  }, [search, resource, resetPage])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const columns = useMemo<ColumnDef<AdminAuditRow>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-xs capitalize">
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: 'resource',
        header: 'Resource',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.resource}</span>
        ),
      },
      {
        accessorKey: 'resource_id',
        header: 'Resource ID',
        cell: ({ row }) => (
          <span className="text-xs font-mono">{row.original.resource_id ?? '—'}</span>
        ),
      },
      {
        id: 'details',
        header: 'Details',
        cell: ({ row }) => {
          const hasDetails =
            row.original.details &&
            typeof row.original.details === 'object' &&
            Object.keys(row.original.details).length > 0
          const isExpanded = expanded === row.original.id
          if (!hasDetails) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : row.original.id)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {isExpanded ? 'Hide' : 'Show'}
            </button>
          )
        },
      },
    ],
    [expanded],
  )

  const table = useAdminTable({
    data: logs,
    columns,
    enableSorting: false,
    getRowId: (row) => row.id,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_TABLE_PAGE_SIZE)),
    rowCount: total,
    onPaginationChange: setPagination,
    state: { pagination },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <MagnifyingGlass
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search action or resource…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={resource} onValueChange={setResource}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            <SelectItem value="artists">Artists</SelectItem>
            <SelectItem value="releases">Releases</SelectItem>
            <SelectItem value="news">News</SelectItem>
            <SelectItem value="videos">Videos</SelectItem>
            <SelectItem value="users">Users</SelectItem>
            <SelectItem value="settings">Settings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminTablePagination
        pageIndex={pagination.pageIndex}
        totalCount={total}
        onPageChange={(pageIndex) => setPagination((prev) => ({ ...prev, pageIndex }))}
      />

      <AdminDataTable
        table={table}
        loading={loading}
        emptyMessage="No admin action entries found."
        renderSubRow={(row) => {
          const hasDetails =
            row.original.details &&
            typeof row.original.details === 'object' &&
            Object.keys(row.original.details).length > 0
          const isExpanded = expanded === row.original.id
          if (!isExpanded || !hasDetails) return null
          return (
            <TableRow>
              <TableCell colSpan={columns.length} className="bg-muted/30 pb-3 pt-0">
                <pre className="text-xs font-mono break-all whitespace-pre-wrap bg-muted/50 rounded px-3 py-2">
                  {JSON.stringify(row.original.details, null, 2)}
                </pre>
              </TableCell>
            </TableRow>
          )
        }}
      />
    </div>
  )
}

export function LogsManager() {
  return (
    <Tabs defaultValue="audit" className="space-y-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="audit">Sync Log</TabsTrigger>
        <TabsTrigger value="errors">Sync Errors</TabsTrigger>
        <TabsTrigger value="app">App Errors</TabsTrigger>
        <TabsTrigger value="rbac">RBAC Audit</TabsTrigger>
        <TabsTrigger value="actions">Admin Actions</TabsTrigger>
      </TabsList>
      <TabsContent value="audit">
        <SyncLogsPanel />
      </TabsContent>
      <TabsContent value="errors">
        <SyncLogsPanel errorsOnly />
      </TabsContent>
      <TabsContent value="app">
        <AppLogsPanel />
      </TabsContent>
      <TabsContent value="rbac">
        <RbacAuditPanel />
      </TabsContent>
      <TabsContent value="actions">
        <AdminActionsPanel />
      </TabsContent>
    </Tabs>
  )
}