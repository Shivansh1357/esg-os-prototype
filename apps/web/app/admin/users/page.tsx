"use client"
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, SectionCard } from '@/components/product'

export default function UsersAdmin() {
  const [email, setEmail] = useState('')

  function invite() {
    if (!email.trim()) {
      toast.error('Enter a valid email first.')
      return
    }
    toast.success(`Invite stub recorded for ${email}.`)
    setEmail('')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Invite workspace users and assign roles in later iterations."
      />
      <SectionCard title="Invite User">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Work Email</Label>
            <Input
              id="invite-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div className="flex items-end">
            <Button data-test="admin-invite-user" onClick={invite}>
              Invite
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

