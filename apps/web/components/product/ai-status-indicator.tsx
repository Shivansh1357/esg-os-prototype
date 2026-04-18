'use client'

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type AiHealth = {
  status: 'ok' | 'degraded'
  ai: boolean
  message?: string
}

export default function AiStatusIndicator({ className }: { className?: string }) {
  const health = useQuery({
    queryKey: ['ai-health'],
    queryFn: async () => {
      const r = await fetch('/api/ai/health', { cache: 'no-store' })
      return r.json() as Promise<AiHealth>
    },
    refetchInterval: 30_000,
    retry: 1,
  })

  const isOnline = health.data?.ai === true
  const label = isOnline ? 'AI Online' : 'AI Offline'

  return (
    <div
      data-test="ai-status-indicator"
      className={cn('flex items-center gap-1.5 text-xs', className)}
      title={health.data?.message || label}
    >
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          health.isPending
            ? 'bg-muted-foreground animate-pulse'
            : isOnline
            ? 'bg-green-500'
            : 'bg-amber-500'
        )}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
