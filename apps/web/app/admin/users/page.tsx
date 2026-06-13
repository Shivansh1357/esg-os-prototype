"use client"
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getJSON, postJSON } from '@/lib/api'
import { getClientRole } from '@/lib/role'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  EmptyState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBanner,
} from '@/components/product'

type AppUser = {
  id: string
  email: string
  role: 'ADMIN' | 'MEMBER' | 'AUDITOR'
  status: string
  createdAt: string
}

export default function UsersAdmin() {
  const qc = useQueryClient()
  const role = getClientRole()
  const canManage = role === 'ADMIN'
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AppUser['role']>('MEMBER')

  const q = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await getJSON<{ users: AppUser[] }>('/users')).users,
  })

  const invite = useMutation({
    mutationFn: async (body: { email: string; role: AppUser['role'] }) =>
      (await postJSON<{ user: AppUser }>('/users/invite', body)).user,
    onSuccess: async (user) => {
      await qc.invalidateQueries({ queryKey: ['users'] })
      toast.success(`Invite sent to ${user.email}.`)
      setEmail('')
      setInviteRole('MEMBER')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Failed to send invite.')
    },
  })

  function submitInvite() {
    if (!email.trim()) {
      toast.error('Enter a valid email first.')
      return
    }
    invite.mutate({ email: email.trim(), role: inviteRole })
  }

  const rows = q.data ?? []
  const isLoading = q.status === 'pending'
  const isError = q.status === 'error'
  const errorMessage = q.error instanceof Error ? q.error.message : 'Failed to load users.'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Invite workspace users and assign roles."
      />
      <SectionCard title="Invite User">
        {!canManage && (
          <p className="mb-3 text-sm text-muted-foreground" data-test="users-rbac-note">
            Read-only: inviting users requires the ADMIN role.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Work Email</Label>
            <Input
              id="invite-email"
              data-test="invite-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              disabled={!canManage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as AppUser['role'])}
              disabled={!canManage}
            >
              <SelectTrigger id="invite-role" data-test="invite-role-select">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="MEMBER">MEMBER</SelectItem>
                <SelectItem value="AUDITOR">AUDITOR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              data-test="admin-invite-user"
              onClick={submitInvite}
              disabled={!canManage || invite.isPending}
              title={!canManage ? 'Insufficient permissions.' : ''}
            >
              {invite.isPending ? 'Inviting…' : 'Invite'}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Users">
        {isLoading ? (
          <LoadingState testId="users-loading" label="Loading users…" />
        ) : null}

        {isError ? (
          <StatusBanner tone="danger" testId="users-error">
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
            testId="users-empty"
            title="No users yet"
            subtitle="Invite your first workspace user above."
          />
        ) : null}

        {!isLoading && !isError && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <Table data-test="users-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>{u.status}</TableCell>
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
