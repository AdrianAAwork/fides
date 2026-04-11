'use client'

import { useState } from 'react'

type Step =
  | 'choose'
  | 'solo-form'
  | 'org-choose'
  | 'create-form'
  | 'join-form'
  | 'invite-success'

interface Props {
  initialName: string
  initialMode?: 'join'
  initialToken?: string
}

export default function OnboardingFlow({ initialName, initialMode, initialToken }: Props) {
  const [step, setStep] = useState<Step>(
    initialMode === 'join' ? 'join-form' : 'choose',
  )
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Fides</h1>
          <p className="mt-2 text-gray-500">Let&apos;s set up your workspace.</p>
        </div>

        {/* STEP: choose account type */}
        {step === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setStep('solo-form')}
              className="text-left rounded-xl border-2 border-gray-200 bg-white p-6 hover:border-indigo-500 hover:shadow-md transition-all"
            >
              <div className="text-2xl mb-3">👤</div>
              <h2 className="text-lg font-semibold text-gray-900">Just me</h2>
              <p className="mt-1 text-sm text-gray-500">
                I am an independent analyst or consultant working alone. My own private workspace.
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-indigo-600">
                Set up my workspace →
              </span>
            </button>

            <button
              onClick={() => setStep('org-choose')}
              className="text-left rounded-xl border-2 border-gray-200 bg-white p-6 hover:border-indigo-500 hover:shadow-md transition-all"
            >
              <div className="text-2xl mb-3">🏢</div>
              <h2 className="text-lg font-semibold text-gray-900">My organisation</h2>
              <p className="mt-1 text-sm text-gray-500">
                I am part of a team. We will share a vendor register and collaborate on assessments.
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-indigo-600">
                Get started →
              </span>
            </button>
          </div>
        )}

        {/* STEP: org sub-choice */}
        {step === 'org-choose' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-4">
            <button
              onClick={() => setStep('choose')}
              className="text-sm text-gray-400 hover:text-gray-600 mb-2"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">My organisation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => setStep('create-form')}
                className="text-left rounded-lg border-2 border-gray-200 p-5 hover:border-indigo-500 transition-all"
              >
                <h3 className="font-medium text-gray-900">Create a new organisation</h3>
                <p className="mt-1 text-sm text-gray-500">Set up a shared workspace and invite your team.</p>
              </button>
              <button
                onClick={() => setStep('join-form')}
                className="text-left rounded-lg border-2 border-gray-200 p-5 hover:border-indigo-500 transition-all"
              >
                <h3 className="font-medium text-gray-900">Join with an invite code</h3>
                <p className="mt-1 text-sm text-gray-500">You have a link or code from a colleague.</p>
              </button>
            </div>
          </div>
        )}

        {/* STEP: solo form */}
        {step === 'solo-form' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <button
              onClick={() => setStep('choose')}
              className="text-sm text-gray-400 hover:text-gray-600 mb-6 block"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Your workspace</h2>
            <form onSubmit={handleSoloSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Setting up…' : 'Get started'}
              </button>
            </form>
          </div>
        )}

        {/* STEP: create org form */}
        {step === 'create-form' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <button
              onClick={() => setStep('org-choose')}
              className="text-sm text-gray-400 hover:text-gray-600 mb-6 block"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Create your organisation</h2>
            <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organisation name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  required
                  placeholder="Acme Corp"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Creating…' : 'Create organisation'}
              </button>
            </form>
          </div>
        )}

        {/* STEP: join form */}
        {step === 'join-form' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <button
              onClick={() => setStep('org-choose')}
              className="text-sm text-gray-400 hover:text-gray-600 mb-6 block"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Join an organisation</h2>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invite code or paste invite link
                </label>
                <input
                  type="text"
                  value={inviteToken}
                  onChange={e => setInviteToken(e.target.value)}
                  required
                  placeholder="https://fides-eight.vercel.app/join?token=…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        )}

        {/* STEP: invite success */}
        {step === 'invite-success' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-5">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-semibold text-gray-900">Organisation created!</h2>
            <p className="text-sm text-gray-500">
              Share this invite link with your team. It expires in 7 days.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-md border border-gray-200 p-3">
              <span className="flex-1 text-xs text-gray-700 font-mono truncate">{inviteUrl}</span>
              <button
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => refreshSession()}
              className="w-full py-2.5 px-4 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
