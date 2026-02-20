'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { getJSON } from '@/lib/api'
import { getClientRole } from '@/lib/role'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  DataTableShell,
  KpiGrid,
  PageHeader,
  SectionCard,
  StatCard,
} from '@/components/product'

type PilotTenantRow = {
  tenantId: string | null
  tenantName: string | null
  timeToFirstFact: string | null
  timeToFirstFreeze: string | null
  timeToFirstExecView: string | null
  supplierInviteCount: number
  freezeCompleted: boolean
  lastActivityAt: string | null
  timeToFirstReportSeconds: number | null
  feedbackCount: number
}

type PilotStats = {
  tenants: PilotTenantRow[]
  summary: {
    avgTimeToFirstReportSeconds: number | null
    freezeReachPercent: number
    supplierInviteReachPercent: number
    avgFeedbackRating: number | null
  }
}

type FeedbackItem = {
  id: string
  userId: string | null
  role: string
  page: string
  message: string
  rating: number
  createdAt: string
}

export default function PilotPage() {
  const role = getClientRole()
  const [minRating, setMinRating] = useState(1)
  const [pageLike, setPageLike] = useState('')

  const stats = useQuery({
    queryKey: ['pilot-stats'],
    queryFn: async () => await getJSON<PilotStats>('/pilot/stats')
  })

  const feedback = useQuery({
    queryKey: ['pilot-feedback', minRating, pageLike],
    queryFn: async () =>
      await getJSON<FeedbackItem[]>(`/feedback?limit=20&minRating=${minRating}&pageLike=${encodeURIComponent(pageLike)}`)
  })

  const rows = stats.data?.tenants ?? []
  const summary = stats.data?.summary

  const avgTtf = useMemo(() => formatDuration(summary?.avgTimeToFirstReportSeconds ?? null), [summary?.avgTimeToFirstReportSeconds])

  if (role !== 'ADMIN') {
    return (
      <div className="space-y-4">
        <PageHeader title="Pilot Dashboard" description="Tenant adoption and activation metrics." />
        <SectionCard>
          <p>Insufficient permissions.</p>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Pilot Dashboard" description="Activation, freeze, and experience metrics across pilot tenants." />

      <KpiGrid>
        <Card title="Avg Time to First Report" value={avgTtf} testId="pilot-summary-ttf" />
        <Card title="% Tenants Reaching Freeze" value={`${(summary?.freezeReachPercent ?? 0).toFixed(2)}%`} testId="pilot-summary-freeze" />
        <Card title="% Tenants Inviting Suppliers" value={`${(summary?.supplierInviteReachPercent ?? 0).toFixed(2)}%`} testId="pilot-summary-supplier" />
        <Card title="Avg Feedback Rating" value={summary?.avgFeedbackRating == null ? 'N/A' : summary.avgFeedbackRating.toFixed(2)} testId="pilot-summary-rating" />
      </KpiGrid>

      <SectionCard title="Tenant Progress">
        <div className="mb-4">
          <ChartContainer className="h-[280px] w-full" config={pilotChartConfig}>
            <BarChart
              data={rows.map((r) => ({
                tenant: r.tenantName || r.tenantId?.slice(0, 8) || 'N/A',
                invites: r.supplierInviteCount,
                feedback: r.feedbackCount,
              }))}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tenant" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Bar dataKey="invites" fill="var(--color-invites)" radius={6} />
              <Bar dataKey="feedback" fill="var(--color-feedback)" radius={6} />
            </BarChart>
          </ChartContainer>
        </div>
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>First Fact</TableHead>
                <TableHead>First Freeze</TableHead>
                <TableHead>First Exec View</TableHead>
                <TableHead>Supplier Invites</TableHead>
                <TableHead>Freeze</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.tenantId ?? 'tenant'}>
                  <TableCell>{r.tenantName || r.tenantId || 'N/A'}</TableCell>
                  <TableCell>{fmtTs(r.timeToFirstFact)}</TableCell>
                  <TableCell>{fmtTs(r.timeToFirstFreeze)}</TableCell>
                  <TableCell>{fmtTs(r.timeToFirstExecView)}</TableCell>
                  <TableCell>{r.supplierInviteCount}</TableCell>
                  <TableCell>{r.freezeCompleted ? 'Done' : 'Pending'}</TableCell>
                  <TableCell>{fmtTs(r.lastActivityAt)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No pilot metrics yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>

      <SectionCard
        title="Feedback Stream"
        right={(
          <div className="flex flex-wrap gap-2">
            <Select value={String(minRating)} onValueChange={(value) => setMinRating(Number(value))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Rating {'>='} 1</SelectItem>
                <SelectItem value="2">Rating {'>='} 2</SelectItem>
                <SelectItem value="3">Rating {'>='} 3</SelectItem>
                <SelectItem value="4">Rating {'>='} 4</SelectItem>
                <SelectItem value="5">Rating {'>='} 5</SelectItem>
              </SelectContent>
            </Select>
            <Input value={pageLike} onChange={(e) => setPageLike(e.target.value)} placeholder="Filter page..." />
          </div>
        )}
      >
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Time</TableHead><TableHead>Role</TableHead><TableHead>Page</TableHead><TableHead>Rating</TableHead><TableHead>Message</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(feedback.data ?? []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{fmtTs(f.createdAt)}</TableCell>
                  <TableCell>{f.role}</TableCell>
                  <TableCell>{f.page}</TableCell>
                  <TableCell>{f.rating}</TableCell>
                  <TableCell>{f.message}</TableCell>
                </TableRow>
              ))}
              {(feedback.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No feedback yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DataTableShell>
      </SectionCard>
    </div>
  )
}

function Card({ title, value, testId }: { title: string; value: string; testId: string }) {
  return <StatCard label={title} value={value} testId={testId} />
}

function fmtTs(v: string | null) {
  if (!v) return 'N/A'
  return new Date(v).toLocaleString()
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return 'N/A'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return `${hours}h ${rem}m`
}

const pilotChartConfig = {
  invites: {
    label: 'Invites',
    color: 'hsl(var(--chart-1))',
  },
  feedback: {
    label: 'Feedback',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig
