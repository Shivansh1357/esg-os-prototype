'use client'

import { useState } from 'react'
import { postJSON } from '@/lib/api'

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
    <>
      <button
        data-test="feedback-open"
        onClick={() => setOpen(true)}
        style={{ position: 'fixed', right: 18, bottom: 18, borderRadius: 999, padding: '10px 14px' }}
      >
        Feedback
      </button>
      {open && (
        <div style={{ position: 'fixed', right: 18, bottom: 68, width: 360, border: '1px solid #223', borderRadius: 10, background: '#0b1020', padding: 12, zIndex: 1000 }}>
          <h4 style={{ marginTop: 0 }}>How is your experience so far?</h4>
          <label>Rating</label>
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={4}>4</option>
            <option value={3}>3</option>
            <option value={2}>2</option>
            <option value={1}>1</option>
          </select>
          <label>Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="What slowed you down?" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => setOpen(false)} disabled={sending}>Cancel</button>
            <button data-test="feedback-submit" onClick={submit} disabled={sending || !message.trim()}>
              {sending ? 'Saving...' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
