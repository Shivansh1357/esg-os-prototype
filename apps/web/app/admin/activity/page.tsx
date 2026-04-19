'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON } from '@/lib/api'
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
import {
  DataTableShell,
  LoadingState,
  PageHeader,
  SectionCard,
  StatCard,
} from '@/components/product'

type ActivityEvent = {
  id: string
  category: 'FACT' | 'COMPLIANCE' | 'FREEZE' | 'SUPPLIER'
  action: string
  at: string
  actor: string | null
  payload: Record<string, unknown>
}

type ActivitySummary = {
  factsCreated: number
  complianceEvaluations: number
  freezes: number
  supplierSubmissions: number
}

type ActivityResponse = {
  events: ActivityEvent[]
  summary: ActivitySummary
}

const CATEGORY_LABELS: Record<ActivityEvent['category'], string> = {
  FACT: 'Fact',
  COMPLIANCE: 'Compliance',
  FREEZE: 'Freeze',
  SUPPLIER: 'Supplier',
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<'ALL' | ActivityEvent['category']>('ALL')

  const q = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => getJSON<ActivityResponse>('/admin/activity'),
  })

  const events = (q.data?.events ?? []).filter(
    (e) => filter === 'ALL' || e.category === filter
  )
  const summary = q.data?.summary

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Activity"
        description="Aggregated user activity across facts, compliance, freezes, and supplier submissions over the last 30 days."
        right={
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as typeof filter)}
          >
            <SelectTrigger
              className="w-[170px]"
              data-test="activity-filter"
              aria-label="Filter activity by category"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              <SelectItem value="FACT">Facts</SelectItem>
              <SelectItem value="COMPLIANCE">Compliance</SelectItem>
              <SelectItem value="FREEZE">Freezes</SelectItem>
              <SelectItem value="SUPPLIER">Suppliers</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {q.isLoading ? (
        <LoadingState label="Loading activity..." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Facts Created"
              value={summary?.factsCreated ?? 0}
              hint="Last 30 days"
              testId="stat-facts-created"
            />
            <StatCard
              label="Compliance Evaluations"
              value={summary?.complianceEvaluations ?? 0}
              hint="Last 30 days"
              testId="stat-compliance-evals"
            />
            <StatCard
              label="Report Freezes"
              value={summary?.freezes ?? 0}
              hint="Last 30 days"
              testId="stat-freezes"
            />
            <StatCard
              label="Supplier Submissions"
              value={summary?.supplierSubmissions ?? 0}
              hint="Last 30 days"
              testId="stat-supplier-subs"
            />
          </div>

          <SectionCard title="Recent Activity">
            <DataTableShell>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={`${e.category}-${e.id}`}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(e.at).toLocaleString()}
                      </TableCell>
                      <TableCell>{CATEGORY_LABELS[e.category]}</TableCell>
                      <TableCell>{e.action}</TableCell>
                      <TableCell>{e.actor ?? '\u2014'}</TableCell>
                      <TableCell>
                        <pre className="max-w-[420px] whitespace-pre-wrap break-all text-xs">
                          {JSON.stringify(e.payload)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-muted-foreground"
                      >
                        No activity found in the last 30 days.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </DataTableShell>
          </SectionCard>
        </>
      )}
    </div>
  )
}
