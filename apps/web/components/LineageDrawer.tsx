'use client'

import React, { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Fact = {
  id: string
  metricCode: string
  unit: string
  value: number
  sourceRef?: string
  approvedAt?: string
  outlier?: boolean
  factors?: { loc?: number; mkt?: number }
}
type Entity = {
  id: string
  name: string
  totals?: { scope1?: number; scope2_loc?: number; scope2_mkt?: number; scope3?: number }
  facts: Fact[]
}
type Evidence = { rule_code?: string; ruleCode?: string; status: string; reason?: string; evidence_url?: string; evidenceUrl?: string }
type Lineage = {
  report: { id:string; name:string; template:string; periodStart:string; periodEnd:string; version?: string; locked?: boolean }
  factorSet?: { id?: string; code?: string; name?: string; version?: string }
  entities: Entity[]
  evidence: Evidence[]
  notes?: Array<{ metricCode:string; unit:string; locFactor?:number; mktFactor?:number }>
}

export default function LineageDrawer({ data, onClose }: { data: Lineage; onClose: ()=>void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (k:string)=> setExpanded(e=> ({...e, [k]: !e[k]}))

  const header = useMemo(()=> {
    return {
      title: `${data.report?.name || 'Report'} — v${data.report?.version || '?.?'} ${data.report?.locked ? '🔒' : ''}`,
      period: `${data.report?.periodStart} → ${data.report?.periodEnd}`,
      factor: data.factorSet ? `${data.factorSet.code} v${data.factorSet.version}` : 'N/A'
    }
  }, [data])

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-[96vw] max-w-[1320px] p-0 sm:max-w-[1320px]">
        <SheetHeader className="border-b border-border/70 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle>{header.title}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                Period: {header.period} • Factor set: {header.factor}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </SheetHeader>

        <div className="grid h-[calc(100vh-72px)] grid-cols-1 overflow-hidden lg:grid-cols-[2fr_1fr]">
          <div className="overflow-auto border-r border-border/70">
            <SectionTitle>Entities & Facts</SectionTitle>
            {data.entities?.map((e) => (
              <div key={e.id} className="border-b border-border/60 px-4 py-3">
                <button className="flex w-full items-center justify-between text-left" onClick={()=>toggle(e.id)}>
                  <div className="font-semibold">{e.name}</div>
                  <div className="text-xs text-muted-foreground">
                    S1 {fmt(e.totals?.scope1)} • S2L {fmt(e.totals?.scope2_loc)} • S2M {fmt(e.totals?.scope2_mkt)} • S3 {fmt(e.totals?.scope3)}
                    {' '} {expanded[e.id] ? '▲' : '▼'}
                  </div>
                </button>
                {expanded[e.id] && (
                  <div className="mt-2 overflow-x-auto rounded-md border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Loc factor</TableHead>
                          <TableHead>Mkt factor</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Approved</TableHead>
                          <TableHead>Outlier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(e.facts || []).map(f => (
                          <TableRow key={f.id}>
                            <TableCell><code>{f.metricCode}</code></TableCell>
                            <TableCell>{fmt(f.value)}</TableCell>
                            <TableCell>{f.unit}</TableCell>
                            <TableCell>{f.factors?.loc ?? ''}</TableCell>
                            <TableCell>{f.factors?.mkt ?? ''}</TableCell>
                            <TableCell className="max-w-[260px] truncate">
                              {f.sourceRef ? <a href={f.sourceRef} target="_blank" rel="noreferrer">{f.sourceRef}</a> : '—'}
                            </TableCell>
                            <TableCell>{f.approvedAt ? new Date(f.approvedAt).toLocaleString() : '—'}</TableCell>
                            <TableCell>{f.outlier ? '⚠️' : ''}</TableCell>
                          </TableRow>
                        ))}
                        {(!e.facts || e.facts.length===0) && (
                          <TableRow><TableCell colSpan={8} className="py-4 text-center text-muted-foreground">No facts</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
            {(data.entities?.length ?? 0) === 0 && <div className="px-4 py-4 text-sm text-muted-foreground">No entities.</div>}
          </div>

          <div className="overflow-auto">
            <SectionTitle>Evidence</SectionTitle>
            <div className="space-y-2 px-4 py-3">
              {(data.evidence || []).map((ev, i) => {
                const rule = ev.ruleCode || ev.rule_code
                const url = ev.evidenceUrl || ev.evidence_url
                return (
                  <div key={`${rule}-${i}`} className="rounded-lg border border-border/70 bg-card/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{rule}</div>
                      <StatusBadge status={ev.status} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{ev.reason || '—'}</div>
                    <div className="mt-2 text-xs">
                      {url ? <a href={url} target="_blank" rel="noreferrer">{url}</a> : '—'}
                    </div>
                  </div>
                )
              })}
              {(data.evidence?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">No evidence captured.</div>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SectionTitle({ children }:{ children:React.ReactNode }) {
  return <div className="border-b border-border/70 bg-muted/30 px-4 py-2 text-sm font-semibold">{children}</div>
}

function fmt(n:any){ if(n==null) return 0; try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:2 }).format(Number(n)) } catch { return String(n) } }

function StatusBadge({ status }:{ status:string }){
  if (status === 'PASS') return <Badge className="bg-success/20 text-success hover:bg-success/20">PASS</Badge>
  if (status === 'RISK') return <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">RISK</Badge>
  if (status === 'FAIL') return <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/20">FAIL</Badge>
  return <Badge variant="secondary">{status}</Badge>
}
