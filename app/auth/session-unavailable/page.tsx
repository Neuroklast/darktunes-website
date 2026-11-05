export const dynamic = 'force-dynamic'

/**
 * A temporary permissions lookup failure is not an authorization denial.
 * Do not sign out or clear auth cookies here. The next navigation retries
 * the verified session and the server-side role lookup.
 */
export default function SessionUnavailablePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-semibold">Session temporarily unavailable</h1>
      <p className="text-muted-foreground">
        Your session has not been signed out. We could not verify your account
        permissions right now. Please try again.
      </p>
      <a
        href="/admin"
        className="rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground hover:opacity-90"
      >
        Retry
      </a>
    </main>
  )
}
