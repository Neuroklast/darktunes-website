export default function AgbLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-3xl space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="h-10 w-48 bg-muted rounded" />
        <div className="h-40 w-full bg-muted rounded" />
      </div>
    </div>
  )
}
