'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { getJSON, postJSON } from '@/lib/api'
import { useReportContext } from './report-context'

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
    <main style={{ padding: 24 }}>
      <h1>ESG OS</h1>
      <p>Use the navigation: /onboarding, /admin/users, /admin/entities, /data</p>

      <section style={{ marginTop: 16, border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Start Your First Report</h3>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Target: complete first freeze in under 30 minutes.</div>
          </div>
          <button data-test="start-first-report" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? 'Preparing...' : 'Start Your First Report'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 16, border: '1px solid #223', borderRadius: 10, padding: 12, background: '#0b1020' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Onboarding Checklist</h3>
          <div data-test="onboarding-progress">{percent.toFixed(0)}%</div>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: '#162038', overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${Math.min(100, Math.max(0, percent))}%`, height: '100%', background: '#29c17e' }} />
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item) => (
            <li key={item.key} style={{ padding: '6px 0', opacity: item.done ? 1 : 0.8 }}>
              {item.done ? '☑' : '☐'} {item.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}


