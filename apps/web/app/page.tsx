'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { getJSON, postJSON } from '@/lib/api'
import { useReportContext } from './report-context'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { PageHeader, SectionCard, StatusBanner } from '@/components/product'
import { CheckCircle2, Circle } from 'lucide-react'

type ChecklistItem = { key: string; label: string; done: boolean }
type ChecklistResponse = { percent: number; items: ChecklistItem[] }
type StartResponse = { reportId: string; periodStart: string; periodEnd: string; created: boolean }

export default function Home() {
  const router = useRouter()
  const { setReportId } = useReportContext()
  const checklist = useQuery({
    queryKey: ['pilot-checklist'],
    queryFn: async () => await getJSON<ChecklistResponse>('/pilot/onboarding/checklist'),
    refetchInterval: 5000
  })

  const start = useMutation({
    mutationFn: async () => await postJSON<StartResponse>('/pilot/start-first-report', {}),
    onSuccess: (data) => {
      setReportId(data.reportId)
      router.push(`/data?reportId=${data.reportId}&onboarding=1&step=1`)
    }
  })

  const percent = Number(checklist.data?.percent ?? 0)
  const items = checklist.data?.items ?? []

  return (
    <main className="space-y-4">
      <PageHeader
        title="ESG OS Workspace"
        description="Run the full flow from onboarding to frozen reports with audit-ready controls."
      />

      <SectionCard
        title="Start Your First Report"
        right={
          <Button
            data-test="start-first-report"
            onClick={() => start.mutate()}
            disabled={start.isPending}
          >
            {start.isPending ? 'Preparing...' : 'Start Your First Report'}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Target outcome: complete your first report freeze in under 30 minutes.
        </p>
      </SectionCard>

      <SectionCard
        title="Onboarding Checklist"
        right={<span data-test="onboarding-progress" className="text-sm font-semibold">{percent.toFixed(0)}%</span>}
      >
        <Progress value={Math.min(100, Math.max(0, percent))} className="mb-3 h-2.5" />
        {items.length === 0 ? (
          <StatusBanner tone="info">Checklist will appear once onboarding data is available.</StatusBanner>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-2 text-sm"
              >
                {item.done ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={item.done ? '' : 'text-muted-foreground'}>{item.label}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </main>
  )
}

