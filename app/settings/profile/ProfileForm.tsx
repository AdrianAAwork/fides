'use client'

import { useState } from 'react'
import Link from 'next/link'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
}

interface Props {
  initialDisplayName: string
  email: string
  role: string
  orgName: string
  isAdmin: boolean
}

export default function ProfileForm({ initialDisplayName, email, role, orgName, isAdmin }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage(data.error ?? 'Failed to save'); return }
      setMessage('Saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F3F8]">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#5B3FD4] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
          </div>
          <span className="text-[#E2DFF0]">·</span>
          <Link href="/dashboard" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">Dashboard</Link>
          <span className="text-[#E2DFF0]">·</span>
          <h1 className="text-[15px] font-medium text-[#1A1625]">Profile</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
          <form onSubmit={save} className="space-y-5">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">Email</label>
              <p className="text-[14px] text-[#5B5478]">{email}</p>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">Role</label>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#EEEDFE] text-[#5B3FD4]">
                {ROLE_LABELS[role] ?? role}
              </span>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">Organisation</label>
              {isAdmin ? (
                <Link href="/settings/organisation" className="text-[14px] text-[#5B3FD4] hover:text-[#3C3489]">
                  {orgName}
                </Link>
              ) : (
                <p className="text-[14px] text-[#5B5478]">{orgName}</p>
              )}
            </div>

            {message && (
              <p className={`text-[13px] ${message === 'Saved.' ? 'text-[#27500A]' : 'text-[#791F1F]'}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
