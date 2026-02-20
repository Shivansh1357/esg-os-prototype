'use client'

import { useState } from 'react'
import { postJSON } from '@/lib/api'
import { MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function FeedbackPrompt() {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(4)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    setSending(true)
    try {
      await postJSON('/feedback', {
        page: typeof window !== 'undefined' ? window.location.pathname : '/',
        message,
        rating
      })
      setMessage('')
      setOpen(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button data-test="feedback-open" className="rounded-full shadow-lg">
            <MessageSquareQuote className="mr-2 size-4" />
            Feedback
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] space-y-3">
          <div>
            <h4 className="font-heading text-base font-semibold">How is your experience so far?</h4>
            <p className="text-xs text-muted-foreground">Your feedback helps prioritize pilot improvements.</p>
          </div>
          <div className="space-y-2">
            <Label>Rating</Label>
            <Select value={String(rating)} onValueChange={(v) => setRating(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Select rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="1">1</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What slowed you down?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              data-test="feedback-submit"
              type="button"
              onClick={submit}
              disabled={sending || !message.trim()}
            >
              {sending ? 'Saving...' : 'Submit'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
