import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDownloadAssetLabel } from '@/lib/press/bioAssetKey'
import type { JournalistDownload } from '@/types'

interface DownloadHistoryTableProps {
  entries: JournalistDownload[]
  title: string
  emptyLabel: string
}

export function DownloadHistoryTable({ entries, title, emptyLabel }: DownloadHistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-border p-3">
              <p className="font-medium">{formatDownloadAssetLabel(entry.assetKey)}</p>
              {entry.assetKey.startsWith('bio:') ? (
                <p className="text-xs text-muted-foreground font-mono">{entry.assetKey}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">{new Date(entry.downloadedAt).toLocaleString()}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
