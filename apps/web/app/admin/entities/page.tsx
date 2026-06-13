"use client"
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getJSON, postJSON } from '@/lib/api'
import { getClientRole } from '@/lib/role'
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
import {
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBanner,
} from '@/components/product'

type Entity = {
  id: string
  name: string
  etype: 'ORG' | 'BU' | 'SITE'
  parentId: string | null
  createdAt: string
}

export default function EntitiesAdmin() {
  const qc = useQueryClient()
  const role = getClientRole()
  const canManage = role === 'ADMIN'
  const [name, setName] = useState('')
  const [etype, setEtype] = useState<Entity['etype']>('ORG')

  const q = useQuery({
    queryKey: ['entities'],
    queryFn: async () => (await getJSON<{ entities: Entity[] }>('/entities')).entities,
  })

  const create = useMutation({
    mutationFn: async (body: { name: string; etype: Entity['etype'] }) =>
      (await postJSON<{ entity: Entity }>('/entities', body)).entity,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['entities'] })
      toast.success('Entity created.')
      setName('')
      setEtype('ORG')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Failed to create entity.')
    },
  })

  function addRow() {
    if (!name.trim()) {
      toast.error('Enter an entity name first.')
      return
    }
    create.mutate({ name: name.trim(), etype })
  }

  const rows = q.data ?? []
  const isLoading = q.status === 'pending'
  const isError = q.status === 'error'
  const errorMessage = q.error instanceof Error ? q.error.message : 'Failed to load entities.'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Entities"
        description="Create organization, business-unit, and site entities used by reporting workflows."
      />
      <SectionCard title="Create Entity">
        {!canManage && (
          <p className="mb-3 text-sm text-muted-foreground" data-test="entities-rbac-note">
            Read-only: creating entities requires the ADMIN role.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="space-y-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              data-test="entity-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Entity name"
              disabled={!canManage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-type">Type</Label>
            <Select
              value={etype}
              onValueChange={(value) => setEtype(value as Entity['etype'])}
              disabled={!canManage}
            >
              <SelectTrigger id="entity-type" data-test="entity-type-select">
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
            <Button
              data-test="entity-create-btn"
              onClick={addRow}
              disabled={!canManage || create.isPending}
              title={!canManage ? 'Insufficient permissions.' : ''}
            >
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Entity List">
        {isLoading ? (
          <LoadingState testId="entities-loading" label="Loading entities…" />
        ) : null}

        {isError ? (
          <StatusBanner tone="danger" testId="entities-error">
            <div className="flex flex-wrap items-center gap-3">
              <span>{errorMessage}</span>
              <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                Retry
              </Button>
            </div>
          </StatusBanner>
        ) : null}

        {!isLoading && !isError && rows.length === 0 ? (
          <EmptyState
            testId="entities-empty"
            title="No entities yet"
            subtitle="Create your first organization, business unit, or site above."
          />
        ) : null}

        {!isLoading && !isError && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <Table data-test="entities-table">
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
        ) : null}
      </SectionCard>
    </div>
  )
}
