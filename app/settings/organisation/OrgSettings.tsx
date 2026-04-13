'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'
import OrgLogo from '@/src/components/OrgLogo'
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

  const [orgName, setOrgName] = useState(initialOrg.name)
  const [brandColor, setBrandColor] = useState(initialOrg.brandColor ?? '#5B3FD4')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  const [showLogoDialog, setShowLogoDialog] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [logoSuccess, setLogoSuccess] = useState('')
  const [logoRefreshKey, setLogoRefreshKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [showAtLimitModal, setShowAtLimitModal] = useState(false)
  const [pendingInviteAtLimit, setPendingInviteAtLimit] = useState(false)

  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

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
    if (!allowed.includes(file.type)) { setLogoError('File must be PNG, JPEG, or SVG.'); return }
    if (file.size > 2 * 1024 * 1024) { setLogoError('File must be under 2MB.'); return }
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
      console.log('[logo upload] POST /api/org/logo — file:', logoFile.name, logoFile.type, logoFile.size)
      const res = await fetch('/api/org/logo', { method: 'POST', body: fd })
      console.log('[logo upload] response status:', res.status)

      let data: Record<string, unknown> = {}
      try {
        data = await res.json()
      } catch (parseErr) {
        console.error('[logo upload] could not parse response JSON:', parseErr)
        setLogoError('Upload failed — unexpected server response. Check the browser console.')
        return
      }

      console.log('[logo upload] response body:', data)

      if (!res.ok) {
        setLogoError((data.error as string) ?? 'Upload failed.')
        return
      }

      const newUrl = data.logoUrl as string
      setOrg(prev => ({ ...prev, logoUrl: newUrl }))
      setLogoRefreshKey(k => k + 1)
      setShowLogoDialog(false)
      setLogoFile(null)
      setLogoPreview(null)
      setLogoError('')
      setLogoSuccess('Logo uploaded successfully')
    } catch (err) {
      console.error('[logo upload] fetch threw:', err)
      setLogoError('Upload failed — network error. Check the browser console.')
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
      if (res.ok) { setMembers(prev => prev.filter(m => m.id !== userId)); setRemoveConfirmId(null) }
    } finally {
      setRemoving(false)
    }
  }

  async function generateInvite(force = false) {
    if (!force && memberCount >= org.memberLimit) { setShowAtLimitModal(true); return }
    setGeneratingInvite(true)
    setShowAtLimitModal(false)
    try {
      const res = await fetch('/api/org/invite', { method: 'POST' })
      const data = await res.json()
      if (res.ok) { setInviteUrl(data.inviteUrl); setPendingInviteAtLimit(data.atLimit) }
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
    <div className="min-h-screen bg-[#F4F3F8]">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <FidesSeal size={32} />
              <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
            </Link>
            <span className="text-[#E2DFF0]">·</span>
            <Link href="/dashboard" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">Dashboard</Link>
            <span className="text-[#E2DFF0]">·</span>
            <h1 className="text-[15px] font-medium text-[#1A1625]">Organisation settings</h1>
          </div>
          {(org.logoUrl || org.name !== 'My organization') && (
            <div className="flex items-center gap-2">
              {org.logoUrl && (
                <OrgLogo style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} refreshKey={logoRefreshKey} />
              )}
              {org.name !== 'My organization' && (
                <span className="text-[13px] text-[#8B85A8]">{org.name}</span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {/* Organisation profile */}
        <section className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-5">
          <h2 className="text-[15px] font-medium text-[#1A1625]">Organisation profile</h2>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-2">Logo</label>
            <div className="flex items-center gap-4">
              {org.logoUrl ? (
                <div className="h-16 w-auto max-w-[128px] rounded-lg border border-[#E2DFF0] flex items-center justify-center overflow-hidden p-1">
                  <OrgLogo
                    refreshKey={logoRefreshKey}
                    style={{ maxHeight: 56, maxWidth: 120, objectFit: 'contain' }}
                  />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-lg border-2 border-dashed border-[#E2DFF0] flex items-center justify-center text-[#B8B3CE]">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="space-y-1">
                <button
                  onClick={() => { setShowLogoDialog(true); setLogoSuccess('') }}
                  className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium block"
                >
                  {org.logoUrl ? 'Change logo' : 'Upload logo'}
                </button>
                {logoSuccess && (
                  <p className="text-[12px] text-[#27500A]">{logoSuccess}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">Organisation name</label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent"
            />
            <p className="mt-1 text-[12px] text-[#B8B3CE]">Slug: {org.slug}</p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">Brand color</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                placeholder="#5B3FD4"
                maxLength={7}
                className="w-32 rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] font-mono text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent"
              />
              <div
                className="h-9 w-9 rounded-lg border border-[#E2DFF0] shrink-0"
                style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#E2DFF0' }}
              />
            </div>
          </div>

          {profileMsg && <p className={`text-[13px] ${profileMsg === 'Saved.' ? 'text-[#27500A]' : 'text-[#791F1F]'}`}>{profileMsg}</p>}

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
          >
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </section>

        {/* Members */}
        <section className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-[#1A1625]">Members</h2>
            <span className="text-[13px] text-[#8B85A8]">
              {memberCount} of {org.memberLimit} members
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2DFF0]">
                <th className="text-left py-2 text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">Name</th>
                <th className="text-left py-2 text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">Email</th>
                <th className="text-left py-2 text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">Role</th>
                <th className="text-left py-2 text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-[#E2DFF0] last:border-0">
                  <td className="py-3 text-[14px] text-[#1A1625]">{m.displayName}</td>
                  <td className="py-3 text-[13px] text-[#5B5478]">{m.email}</td>
                  <td className="py-3">
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value)}
                      disabled={m.id === currentUserId}
                      className="text-[13px] rounded-lg border border-[#E2DFF0] px-2 py-1 text-[#1A1625] focus:outline-none focus:ring-1 focus:ring-[#5B3FD4] disabled:opacity-50"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="py-3 text-[#B8B3CE] text-[12px]">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-right">
                    {m.id !== currentUserId && (
                      removeConfirmId === m.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[12px] text-[#5B5478]">Remove {m.displayName}?</span>
                          <button onClick={() => removeMember(m.id)} disabled={removing}
                            className="text-[12px] text-[#791F1F] hover:text-red-800 font-medium">
                            {removing ? '…' : 'Confirm'}
                          </button>
                          <button onClick={() => setRemoveConfirmId(null)}
                            className="text-[12px] text-[#8B85A8] hover:text-[#5B5478]">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setRemoveConfirmId(m.id)}
                          className="text-[12px] text-[#B8B3CE] hover:text-[#791F1F]">
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

        {/* Invite members */}
        {!isSolo && (
          <section className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-4">
            <h2 className="text-[15px] font-medium text-[#1A1625]">Invite members</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => generateInvite()}
                disabled={generatingInvite}
                className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
              >
                {generatingInvite ? 'Generating…' : 'Generate invite link'}
              </button>
              {memberCount >= 3 && memberCount < org.memberLimit && (
                <span className="text-[13px] text-[#633806]">
                  {memberCount} of {org.memberLimit} free seats used
                </span>
              )}
            </div>
            {inviteUrl && (
              <div className="space-y-1">
                {pendingInviteAtLimit && (
                  <p className="text-[12px] text-[#633806]">
                    New members will be added in a pending state until you upgrade your plan.
                  </p>
                )}
                <div className="flex items-center gap-2 bg-[#F9F8FD] rounded-lg border border-[#E2DFF0] p-3">
                  <span className="flex-1 text-[12px] font-mono text-[#5B5478] truncate">{inviteUrl}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    className="shrink-0 text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-[12px] text-[#B8B3CE]">Expires in 7 days.</p>
              </div>
            )}
          </section>
        )}

        {/* Danger zone */}
        <section className="bg-white rounded-xl border border-[#FCEBEB] px-6 py-5 space-y-4">
          <h2 className="text-[15px] font-medium text-[#791F1F]">Danger zone</h2>
          <p className="text-[14px] text-[#5B5478]">
            Permanently deletes the organisation and all associated data. This cannot be undone.
          </p>
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-[#5B5478]">
              Type <span className="font-mono text-[#1A1625]">{org.name}</span> to confirm
            </label>
            <input
              type="text"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              placeholder={org.name}
            />
          </div>
          {deleteError && <p className="text-[13px] text-[#791F1F]">{deleteError}</p>}
          <button
            onClick={deleteOrg}
            disabled={deletingOrg || deleteInput !== org.name}
            className="px-4 py-2 rounded-lg border border-[#FCEBEB] text-[#791F1F] text-[13px] font-medium hover:bg-[#FCEBEB] disabled:opacity-40 transition-colors"
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
          <div className="bg-white rounded-xl border border-[#E2DFF0] p-6 w-full max-w-sm space-y-4">
            <h3 className="text-[15px] font-medium text-[#1A1625]">Upload your organisation logo</h3>
            <p className="text-[12px] text-[#8B85A8]">
              PNG, JPG or SVG · Max 2MB · Square or horizontal works best
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
              className="w-full py-2 rounded-lg border-2 border-dashed border-[#E2DFF0] text-[13px] text-[#8B85A8] hover:border-[#5B3FD4] hover:text-[#5B3FD4] transition-colors"
            >
              {logoFile ? logoFile.name : 'Choose file'}
            </button>
            {logoPreview && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="Preview" className="max-h-24 max-w-full object-contain rounded-lg" />
              </div>
            )}
            {logoError && <p className="text-[13px] text-[#791F1F]">{logoError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowLogoDialog(false); setLogoFile(null); setLogoPreview(null); setLogoError('') }}
                className="px-4 py-2 text-[13px] text-[#5B5478] hover:text-[#1A1625]"
              >
                Cancel
              </button>
              <button
                onClick={uploadLogo}
                disabled={!logoFile || uploadingLogo}
                className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
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
          <div className="bg-white rounded-xl border border-[#E2DFF0] p-6 w-full max-w-sm space-y-4">
            <h3 className="text-[15px] font-medium text-[#1A1625]">Free member limit reached</h3>
            <p className="text-[14px] text-[#5B5478]">
              You have reached the 5-member free limit. You can still send this invite — the new member will be added in a pending state and activated when you upgrade your plan.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAtLimitModal(false)}
                className="px-4 py-2 text-[13px] text-[#5B5478] hover:text-[#1A1625]"
              >
                Cancel
              </button>
              <button
                onClick={() => generateInvite(true)}
                className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors"
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
