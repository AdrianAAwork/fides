'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface ContractData {
  slaUptime?: string
  rto?: string
  rpo?: string
  contractExpiry?: string
  nextReviewDate?: string
  accountManagerName?: string
  accountManagerEmail?: string
  notes?: string
}

interface Props {
  assessmentId: string
  existing: ContractData | null
  canEdit: boolean
}

const FIELD_LABELS: { key: keyof ContractData; label: string; type: 'text' | 'date' | 'textarea' }[] = [
  { key: 'slaUptime', label: 'SLA uptime commitment', type: 'text' },
  { key: 'rto', label: 'RTO — Recovery Time Objective', type: 'text' },
  { key: 'rpo', label: 'RPO — Recovery Point Objective', type: 'text' },
  { key: 'contractExpiry', label: 'Contract expiry date', type: 'date' },
  { key: 'nextReviewDate', label: 'Next scheduled review date', type: 'date' },
  { key: 'accountManagerName', label: 'Account manager name', type: 'text' },
  { key: 'accountManagerEmail', label: 'Account manager email', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export default function ContractCard({ assessmentId, existing, canEdit }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ContractData>(existing ?? {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasData = existing && Object.values(existing).some(v => v)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/contract`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to save.')
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setForm(existing ?? {})
    setEditing(false)
    setError(null)
  }

  const inputCls = "w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent bg-white"

  return (
    <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8]">Contract &amp; SLA</p>
        {canEdit && !editing && (
          <button
            onClick={() => { setForm(existing ?? {}); setEditing(true) }}
            className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
          >
            {hasData ? 'Edit' : 'Add contract details'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELD_LABELS.filter(f => f.type !== 'textarea').map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">{label}</label>
                <input
                  type={type}
                  value={form[key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1.5">
              Notes <span className="normal-case text-[#B8B3CE]">(max 500 chars)</span>
            </label>
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value.slice(0, 500) }))}
              className={inputCls + ' resize-none'}
            />
            <p className="text-[11px] text-[#B8B3CE] mt-1 text-right">{(form.notes ?? '').length}/500</p>
          </div>
          {error && <p className="text-[13px] text-[#791F1F]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-[#E2DFF0] text-[#5B3FD4] text-[13px] font-medium hover:bg-[#F9F8FD] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : hasData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {FIELD_LABELS.filter(({ key }) => existing?.[key]).map(({ key, label }) => (
            <div key={key} className={key === 'notes' ? 'sm:col-span-2' : ''}>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8]">{label}</dt>
              <dd className="text-[14px] text-[#1A1625] mt-0.5 whitespace-pre-wrap">{existing![key]}</dd>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-[#B8B3CE]">
          No contract details added yet.
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="ml-2 text-[#5B3FD4] hover:text-[#3C3489]"
            >
              Add details →
            </button>
          )}
        </p>
      )}
    </div>
  )
}
