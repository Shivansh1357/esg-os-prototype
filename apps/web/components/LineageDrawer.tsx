'use client'
import React, { useMemo, useState } from 'react'

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
    <div style={backdrop()}>
      <div style={panel()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #223', padding:'10px 12px' }}>
          <div>
            <div style={{ fontWeight:600 }}>{header.title}</div>
            <div style={{ fontSize:12, opacity:0.8 }}>Period: {header.period} • Factor set: {header.factor}</div>
          </div>
          <button onClick={onClose}>Close</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', height:'calc(100% - 48px)' }}>
          <div style={{ borderRight:'1px solid #223', overflow:'auto' }}>
            <SectionTitle>Entities & Facts</SectionTitle>
            {data.entities?.map((e) => (
              <div key={e.id} style={{ borderBottom:'1px solid #132', padding:'8px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', cursor:'pointer' }} onClick={()=>toggle(e.id)}>
                  <div><b>{e.name}</b></div>
                  <div style={{ fontSize:12, opacity:0.8 }}>
                    S1 {fmt(e.totals?.scope1)} • S2L {fmt(e.totals?.scope2_loc)} • S2M {fmt(e.totals?.scope2_mkt)} • S3 {fmt(e.totals?.scope3)}
                    {' '} {expanded[e.id] ? '▲' : '▼'}
                  </div>
                </div>
                {expanded[e.id] && (
                  <div style={{ marginTop:8 }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr>
                          <Th>Metric</Th><Th>Value</Th><Th>Unit</Th><Th>Loc factor</Th><Th>Mkt factor</Th><Th>Source</Th><Th>Approved</Th><Th>Outlier</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(e.facts || []).map(f => (
                          <tr key={f.id}>
                            <Td><code>{f.metricCode}</code></Td>
                            <Td>{fmt(f.value)}</Td>
                            <Td>{f.unit}</Td>
                            <Td>{f.factors?.loc ?? ''}</Td>
                            <Td>{f.factors?.mkt ?? ''}</Td>
                            <Td style={{ maxWidth:260, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {f.sourceRef ? <a href={f.sourceRef} target="_blank" rel="noreferrer">{f.sourceRef}</a> : '—'}
                            </Td>
                            <Td>{f.approvedAt ? new Date(f.approvedAt).toLocaleString() : '—'}</Td>
                            <Td>{f.outlier ? '⚠️' : ''}</Td>
                          </tr>
                        ))}
                        {(!e.facts || e.facts.length===0) && (
                          <tr><Td colSpan={8} style={{ textAlign:'center', opacity:0.7 }}>No facts</Td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {(data.entities?.length ?? 0) === 0 && <div style={{ padding:12, opacity:0.7 }}>No entities.</div>}
          </div>

          <div style={{ overflow:'auto' }}>
            <SectionTitle>Evidence</SectionTitle>
            <div style={{ padding:'8px 12px' }}>
              {(data.evidence || []).map((ev, i) => {
                const rule = ev.ruleCode || ev.rule_code
                const url = ev.evidenceUrl || ev.evidence_url
                return (
                  <div key={`${rule}-${i}`} style={{ border:'1px solid #223', borderRadius:8, padding:10, marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <div><b>{rule}</b></div>
                      <StatusBadge status={ev.status} />
                    </div>
                    <div style={{ fontSize:12, opacity:0.85, marginTop:6 }}>{ev.reason || '—'}</div>
                    <div style={{ marginTop:6, fontSize:12 }}>
                      {url ? <a href={url} target="_blank" rel="noreferrer">{url}</a> : '—'}
                    </div>
                  </div>
                )
              })}
              {(data.evidence?.length ?? 0) === 0 && <div style={{ opacity:0.7 }}>No evidence captured.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }:{ children:React.ReactNode }) {
  return <div style={{ padding:'8px 12px', fontWeight:600, borderBottom:'1px solid #223', background:'#0f1630' }}>{children}</div>
}
function fmt(n:any){ if(n==null) return 0; try{ return Intl.NumberFormat(undefined,{ maximumFractionDigits:2 }).format(Number(n)) } catch { return String(n) } }
function backdrop(){ return { position:'fixed' as const, inset:0, background:'rgba(0,0,0,0.55)', display:'grid', placeItems:'center', zIndex:90 } }
function panel(){ return { width:'min(1100px, 95vw)', height:'min(80vh, 820px)', background:'#0b1020', border:'1px solid #223', borderRadius:10, overflow:'hidden' } }
function Th({children}:{children:React.ReactNode}){ return <th style={{ textAlign:'left', padding:6, background:'#11182f', borderBottom:'1px solid #223' }}>{children}</th> }
function Td({children, colSpan, style}:{children:React.ReactNode; colSpan?:number; style?: React.CSSProperties}){ return <td colSpan={colSpan} style={{ padding:6, borderBottom:'1px solid #223', ...(style||{}) }}>{children}</td> }
function StatusBadge({ status }:{ status:string }){
  const map: Record<string, { bg: string; fg: string }> = {
    PASS: { bg: '#0d2f21', fg: '#7be3b6' },
    FAIL: { bg: '#3a0b0b', fg: '#ff7d7d' },
    RISK: { bg: '#332a00', fg: '#ffd36e' }
  }
  const s = map[status] || { bg:'#11182f', fg:'#eaeefb' }
  return <span style={{ padding:'2px 8px', borderRadius:999, background:s.bg, color:s.fg, fontSize:12 }}>{status}</span>
}


