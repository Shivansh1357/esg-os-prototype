'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the error for observability; replace with a real reporter in prod.
    // eslint-disable-next-line no-console
    console.error('Route render error:', error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page hit an unexpected error. Your data is safe — try again, and if it keeps
          happening, contact support with the reference below.
        </p>
        {error.digest ? (
          <p className="pt-1 font-mono text-xs text-muted-foreground/70">ref: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={() => reset()} data-test="error-retry">
        <RefreshCw className="size-4" aria-hidden />
        Try again
      </Button>
    </div>
  )
}
