'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'success' | 'error' | 'rate_limited'

export default function ResendButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleResend() {
    setStatus('sending')
    setMessage(null)

    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      const data = await res.json() as { success: boolean; message: string; retryAfterSeconds?: number }

      if (res.ok) {
        setStatus('success')
        setMessage(data.message)
      } else if (res.status === 429) {
        setStatus('rate_limited')
        setMessage(
          data.retryAfterSeconds
            ? `Please wait ${data.retryAfterSeconds}s before requesting another email.`
            : data.message
        )
      } else {
        setStatus('error')
        setMessage(data.message)
      }
    } catch {
      setStatus('error')
      setMessage("Couldn't send right now — please try again in a moment.")
    }

    setTimeout(() => { setStatus('idle'); setMessage(null) }, 5000)
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleResend}
        disabled={status === 'sending' || status === 'success'}
        className="w-full flex justify-center py-3 px-4 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? 'Sending...' : 'Resend verification email'}
      </button>

      {message && (
        <p className={`text-[12px] px-3 py-2 rounded-md ${
          status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </p>
      )}
    </div>
  )
}
