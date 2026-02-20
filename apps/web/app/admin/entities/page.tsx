"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader, SectionCard } from '@/components/product'

type Row = { id: string; name: string; etype: 'ORG'|'BU'|'SITE' }
export default function EntitiesAdmin() {
  const [rows, setRows] = useState<Row[]>([{id:'seed-1', name:'HQ', etype:'ORG'}])
  const [name, setName] = useState('')
  const [etype, setEtype] = useState<Row['etype']>('ORG')

  function addRow() {
    if (!name.trim()) return
    setRows((r) => [...r, { id: crypto.randomUUID(), name: name.trim(), etype }])
    setName('')
    setEtype('ORG')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entities"
        description="Create organization, business-unit, and site entities used by reporting workflows."
      />
      <SectionCard title="Create Entity">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="space-y-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Entity name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-type">Type</Label>
            <Select value={etype} onValueChange={(value) => setEtype(value as Row['etype'])}>
              <SelectTrigger id="entity-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ORG">ORG</SelectItem>
                <SelectItem value="BU">BU</SelectItem>
                <SelectItem value="SITE">SITE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={addRow}>Add</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Entity List">
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.etype}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  )
}

