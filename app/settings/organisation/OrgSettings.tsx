'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { InferSelectModel } from 'drizzle-orm'
import type { organisations, users } from '@/src/db/schema'

type Org = InferSelectModel<typeof organisations>
type Member = Pick<
  InferSelectModel<typeof users>,
  'id' | 'displayName' | 'email' | 'role' | 'createdAt'
>

interface Props {
  org: Org
  currentUserId: string
  initialMembers: Member[]
}

export default function OrgSettings({ org: initialOrg, currentUserId, initialMembers }: Props) {
  const [org, setOrg] = useState(initialOrg)
  const [members, setMembers] = useState(initialMembers)

  // Profile section state
  const [orgName, setOrgName] = useState(initialOrg.name)
  const [brandColor, setBrandColor] = useState(initialOrg.brandColor ?? '#4f46e5')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  // Logo dialog state
  const [showLogoDialog, setShowLogoDialog] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Invite section state
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [showAtLimitModal, setShowAtLimitModal] = useState(false)
  const [pendingInviteAtLimit, setPendingInviteAtLimit] = useState(false)

  // Member removal state
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  // Delete org state
  const [deleteInput, setDeleteInput] = useState('')
  const [deletingOrg, setDeletingOrg] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const isSolo = org.accountType === 'SOLO'
  const memberCount = members.length

  async function saveProfile() {
    setSavingProfile(true)
    setProfileMsg('')
    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName, brandColor }),
      })
      const data = await res.json()
      if (!res.ok) { setProfileMsg(data.error ?? 'Failed to save'); return }
      setOrg(data.org)
      setProfileMsg('Saved.')
    } finally {
      setSavingProfile(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError('')
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      setLogoError('File must be PNG, JPEG, or SVG.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('File must be under 2MB.')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo() {
    if (!logoFile) return
    setUploadingLogo(true)
    setLogoError('')
    try {
      const fd = new FormData()
      fd.append('logo', logoFile)
      const res = await fetch('/api/org/logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setLogoError(data.error ?? 'Upload failed'); return }
      setOrg(prev => ({ ...prev, logoUrl: data.logoUrl }))
      setShowLogoDialog(false)
      setLogoFile(null)
      setLogoPreview(null)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function changeRole(userId: string, role: string) {
    const res = await fetch(`/api/org/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: role as Member['role'] } : m))
    }
  }

  async function removeMember(userId: string) {
    setRemoving(true)
    try {
      const res = await fetch(`/api/org/members/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== userId))
        setRemoveConfirmId(null)
      }
    } finally {
      setRemoving(false)
    }
  }

  async function generateInvite(force = false) {
    if (!force && memberCount >= org.memberLimit) {
      setShowAtLimitModal(true)
      return
    }
    setGeneratingInvite(true)
    setShowAtLimitModal(false)
    try {
      const res = await fetch('/api/org/invite', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setInviteUrl(data.inviteUrl)
        setPendingInviteAtLimit(data.atLimit)
      }
    } finally {
      setGeneratingInvite(false)
    }
  }

  async function deleteOrg() {
    setDeletingOrg(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/org', { method: 'DELETE' })
      if (res.ok) {
        window.location.href = '/api/auth/logout'
      } else {
        const data = await res.json()
        setDeleteError(data.error ?? 'Failed to delete')
      }
    } finally {
      setDeletingOrg(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Organisation settings</h1>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Organisation profile */}
        <section className="bg-white rounded-lg shadow p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Organisation profile</h2>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
            <div className="flex items-center gap-4">
              {org.logoUrl ? (
                <Image
                  src={org.logoUrl}
                  alt="Organisation logo"
                  width={64}
                  height={64}
                  className="h-16 w-auto object-contain rounded border border-gray-200"
                />
              ) : (
                <div className="h-16 w-16 rounded border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <button
                onClick={() => setShowLogoDialog(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {org.logoUrl ? 'Change logo' : 'Upload logo'}
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organisation name
            </label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">Slug: {org.slug}</p>
          </div>

          {/* Brand color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                placeholder="#4f46e5"
                maxLength={7}
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div
                className="h-9 w-9 rounded border border-gray-200 shrink-0"
                style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#e5e7eb' }}
              />
            </div>
          </div>

          {profileMsg && <p className="text-sm text-green-600">{profileMsg}</p>}

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </section>

        {/* Members */}
        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Members</h2>
            <span className="text-sm text-gray-500">
              {memberCount} of {org.memberLimit} free members
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="py-3 text-gray-900">{m.displayName}</td>
                  <td className="py-3 text-gray-500">{m.email}</td>
                  <td className="py-3">
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value)}
                      disabled={m.id === currentUserId}
                      className="text-sm rounded border border-gray-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="py-3 text-gray-400 text-xs">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-right">
                    {m.id !== currentUserId && (
                      removeConfirmId === m.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-gray-600">
                            Remove {m.displayName} from {org.name}?
                          </span>
                          <button
                            onClick={() => removeMember(m.id)}
                            disabled={removing}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setRemoveConfirmId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRemoveConfirmId(m.id)}
                          className="text-xs text-gray-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Invite members (ORGANISATION accounts only) */}
        {!isSolo && (
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Invite members</h2>

            <div className="flex items-center gap-3">
              <button
                onClick={() => generateInvite()}
                disabled={generatingInvite}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {generatingInvite ? 'Generating…' : 'Generate invite link'}
              </button>

              {memberCount >= 3 && memberCount < org.memberLimit && (
                <span className="text-sm text-amber-600">
                  {memberCount} of {org.memberLimit} free seats used
                </span>
              )}
            </div>

            {inviteUrl && (
              <div className="space-y-1">
                {pendingInviteAtLimit && (
                  <p className="text-xs text-amber-600">
                    New members will be added in a pending state until you upgrade your plan.
                  </p>
                )}
                <div className="flex items-center gap-2 bg-gray-50 rounded-md border border-gray-200 p-3">
                  <span className="flex-1 text-xs font-mono text-gray-700 truncate">{inviteUrl}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-gray-400">Expires in 7 days.</p>
              </div>
            )}
          </section>
        )}

        {/* Danger zone */}
        <section className="bg-white rounded-lg shadow p-6 space-y-4 border border-red-100">
          <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
          <p className="text-sm text-gray-500">
            Permanently deletes the organisation and all associated data. This cannot be undone.
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Type <span className="font-mono text-gray-900">{org.name}</span> to confirm
            </label>
            <input
              type="text"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder={org.name}
            />
          </div>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <button
            onClick={deleteOrg}
            disabled={deletingOrg || deleteInput !== org.name}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40"
          >
            {deletingOrg ? 'Deleting…' : 'Delete organisation'}
          </button>
        </section>
      </main>

      {/* Logo upload dialog */}
      {showLogoDialog && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowLogoDialog(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Upload your organisation logo</h3>
            <p className="text-xs text-gray-500">
              PNG, JPG or SVG · Max 2MB · Square or horizontal works best for display in the header and on reports
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-md border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              {logoFile ? logoFile.name : 'Choose file'}
            </button>

            {logoPreview && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="Preview" className="max-h-24 max-w-full object-contain rounded" />
              </div>
            )}

            {logoError && <p className="text-sm text-red-600">{logoError}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowLogoDialog(false); setLogoFile(null); setLogoPreview(null); setLogoError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={uploadLogo}
                disabled={!logoFile || uploadingLogo}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploadingLogo ? 'Uploading…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* At-limit modal */}
      {showAtLimitModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAtLimitModal(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Free member limit reached</h3>
            <p className="text-sm text-gray-600">
              You have reached the 5-member free limit. You can still send this invite — the new member will be added in a pending state and activated when you upgrade your plan.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAtLimitModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => generateInvite(true)}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Send invite anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
