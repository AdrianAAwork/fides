'use client'

import { useState } from 'react'
import FidesSeal from '@/src/components/FidesSeal'

type Step = 'choose' | 'solo-form' | 'org-choose' | 'create-form' | 'join-form' | 'invite-success'

interface Props {
  initialName: string
  initialMode?: 'join'
  initialToken?: string
}

export default function OnboardingFlow({ initialName, initialMode, initialToken }: Props) {
  const [step, setStep] = useState<Step>(initialMode === 'join' ? 'join-form' : 'choose')
  const [name, setName] = useState(initialName)
  const [orgName, setOrgName] = useState('')
  const [inviteToken, setInviteToken] = useState(initialToken ?? '')
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function refreshSession(returnTo = '/dashboard') {
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
  }

  async function handleSoloSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/solo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      refreshSession()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateOrgSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/create-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, displayName: name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      setInviteUrl(data.inviteUrl)
      setStep('invite-success')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Invalid invite'); return }
      if (data.status === 'PENDING_UPGRADE') {
        refreshSession('/dashboard?pending=1')
      } else {
        refreshSession()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent"
  const primaryBtnCls = "w-full py-2.5 px-4 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
  const labelCls = "block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5"
  const cardCls = "bg-white rounded-xl border border-[#E2DFF0] px-6 py-5"
  const backBtnCls = "text-[13px] text-[#8B85A8] hover:text-[#5B5478] mb-5 block"

  return (
    <div className="min-h-screen bg-[#F4F3F8] flex items-center justify-center py-12 px-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <FidesSeal size={64} />
          </div>
          <h1 className="text-[22px] font-medium text-[#1A1625]">Welcome to Fides</h1>
          <p className="mt-1.5 text-[13px] text-[#8B85A8]">Let&apos;s set up your workspace.</p>
        </div>

        {/* Choose account type */}
        {step === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setStep('solo-form')}
              className="text-left rounded-xl border border-[#E2DFF0] bg-white px-5 py-5 hover:border-[#5B3FD4] hover:shadow-sm transition-all"
            >
              <div className="text-2xl mb-3">👤</div>
              <h2 className="text-[15px] font-medium text-[#1A1625]">Just me</h2>
              <p className="mt-1 text-[13px] text-[#8B85A8]">
                Independent analyst or consultant. My own private workspace.
              </p>
              <span className="mt-4 inline-block text-[13px] font-medium text-[#5B3FD4]">
                Set up my workspace →
              </span>
            </button>

            <button
              onClick={() => setStep('org-choose')}
              className="text-left rounded-xl border border-[#E2DFF0] bg-white px-5 py-5 hover:border-[#5B3FD4] hover:shadow-sm transition-all"
            >
              <div className="text-2xl mb-3">🏢</div>
              <h2 className="text-[15px] font-medium text-[#1A1625]">My organisation</h2>
              <p className="mt-1 text-[13px] text-[#8B85A8]">
                Part of a team. Share a vendor register and collaborate.
              </p>
              <span className="mt-4 inline-block text-[13px] font-medium text-[#5B3FD4]">
                Get started →
              </span>
            </button>
          </div>
        )}

        {/* Org sub-choice */}
        {step === 'org-choose' && (
          <div className={cardCls + ' space-y-4'}>
            <button onClick={() => setStep('choose')} className={backBtnCls}>← Back</button>
            <h2 className="text-[15px] font-medium text-[#1A1625]">My organisation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setStep('create-form')}
                className="text-left rounded-xl border border-[#E2DFF0] px-4 py-4 hover:border-[#5B3FD4] transition-all"
              >
                <h3 className="text-[14px] font-medium text-[#1A1625]">Create a new organisation</h3>
                <p className="mt-1 text-[13px] text-[#8B85A8]">Set up a shared workspace and invite your team.</p>
              </button>
              <button
                onClick={() => setStep('join-form')}
                className="text-left rounded-xl border border-[#E2DFF0] px-4 py-4 hover:border-[#5B3FD4] transition-all"
              >
                <h3 className="text-[14px] font-medium text-[#1A1625]">Join with an invite code</h3>
                <p className="mt-1 text-[13px] text-[#8B85A8]">You have a link or code from a colleague.</p>
              </button>
            </div>
          </div>
        )}

        {/* Solo form */}
        {step === 'solo-form' && (
          <div className={cardCls}>
            <button onClick={() => setStep('choose')} className={backBtnCls}>← Back</button>
            <h2 className="text-[15px] font-medium text-[#1A1625] mb-5">Your workspace</h2>
            <form onSubmit={handleSoloSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Your name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
              </div>
              {error && <p className="text-[13px] text-[#791F1F]">{error}</p>}
              <button type="submit" disabled={loading} className={primaryBtnCls}>
                {loading ? 'Setting up…' : 'Get started'}
              </button>
            </form>
          </div>
        )}

        {/* Create org form */}
        {step === 'create-form' && (
          <div className={cardCls}>
            <button onClick={() => setStep('org-choose')} className={backBtnCls}>← Back</button>
            <h2 className="text-[15px] font-medium text-[#1A1625] mb-5">Create your organisation</h2>
            <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Organisation name</label>
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required placeholder="Acme Corp" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Your name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
              </div>
              {error && <p className="text-[13px] text-[#791F1F]">{error}</p>}
              <button type="submit" disabled={loading} className={primaryBtnCls}>
                {loading ? 'Creating…' : 'Create organisation'}
              </button>
            </form>
          </div>
        )}

        {/* Join form */}
        {step === 'join-form' && (
          <div className={cardCls}>
            <button onClick={() => setStep('org-choose')} className={backBtnCls}>← Back</button>
            <h2 className="text-[15px] font-medium text-[#1A1625] mb-5">Join an organisation</h2>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Invite code or paste invite link</label>
                <input
                  type="text"
                  value={inviteToken}
                  onChange={e => setInviteToken(e.target.value)}
                  required
                  placeholder="https://fides-eight.vercel.app/join?token=…"
                  className={inputCls}
                />
              </div>
              {error && <p className="text-[13px] text-[#791F1F]">{error}</p>}
              <button type="submit" disabled={loading} className={primaryBtnCls}>
                {loading ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        )}

        {/* Invite success */}
        {step === 'invite-success' && (
          <div className={cardCls + ' text-center space-y-5'}>
            <div className="text-4xl">🎉</div>
            <h2 className="text-[15px] font-medium text-[#1A1625]">Organisation created!</h2>
            <p className="text-[13px] text-[#8B85A8]">
              Share this invite link with your team. It expires in 7 days.
            </p>
            <div className="flex items-center gap-2 bg-[#F9F8FD] rounded-lg border border-[#E2DFF0] p-3">
              <span className="flex-1 text-[12px] text-[#5B5478] font-mono truncate">{inviteUrl}</span>
              <button
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="shrink-0 text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => refreshSession()}
              className={primaryBtnCls}
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
