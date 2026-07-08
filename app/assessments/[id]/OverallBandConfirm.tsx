'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FIDES_TRUST_LABEL } from '@/src/lib/pipeline/types'

const TRUST_BAND_OPTIONS = ['High', 'Medium', 'Low', 'Needs review', 'Not assessed'] as const
type TrustBandOption = typeof TRUST_BAND_OPTIONS[number]

const BAND_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  'High':         { text: 'text-[#27500A]', bg: 'bg-[#EAF3DE]', border: 'border-[#C5DFA8]' },
  'Medium':       { text: 'text-[#633806]', bg: 'bg-[#FAEEDA]', border: 'border-[#F0D5A0]' },
  'Low':          { text: 'text-[#791F1F]', bg: 'bg-[#FCEBEB]', border: 'border-[#F5C6C6]' },
  'Needs review': { text: 'text-[#3C3489]', bg: 'bg-[#EEEDFE]', border: 'border-[#C9C4F8]' },
  'Not assessed': { text: 'text-[#5B5478]', bg: 'bg-[#F9F8FD]', border: 'border-[#E2DFF0]' },
}

interface Props {
  assessmentId: string
  suggestedOverallBand: string
  confirmedOverallBand: string | null
  confirmedOverallNote: string | null
  confirmedBy: string | null
  confirmedAt: Date | string | null
  canOverride: boolean
}

export default function OverallBandConfirm({
  assessmentId,
  suggestedOverallBand,
  confirmedOverallBand,
  confirmedOverallNote,
  confirmedBy,
  confirmedAt,
  canOverride,
}: Props) {
  const router = useRouter()
  const [actionOpen, setActionOpen] = useState<'confirm' | 'override' | null>(null)
  const [selectedBand, setSelectedBand] = useState<TrustBandOption>('High')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfirmed = confirmedOverallBand != null
  const displayBand = confirmedOverallBand ?? suggestedOverallBand
  const isOverridden = confirmedOverallBand != null && confirmedOverallBand !== suggestedOverallBand
  const c = BAND_COLORS[displayBand] ?? BAND_COLORS['Not assessed']

  async function handleSave() {
    const isOverride = selectedBand !== suggestedOverallBand
    if (isOverride && note.trim().length < 10) {
      setError('Please add a note (at least 10 characters) explaining the override.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/overall-band`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedBand: selectedBand, note: note.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to save.')
        return
      }
      setActionOpen(null)
      setNote('')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Band chip */}
      <div className="flex items-center gap-2">
        {!isConfirmed && (
          <span className="text-[11px] text-[#8B85A8]">{FIDES_TRUST_LABEL}:</span>
        )}
        <span className={`inline-flex items-center text-[13px] font-medium px-3 py-1 rounded-full border ${c.text} ${c.bg} ${c.border} ${!isConfirmed ? 'opacity-60' : ''}`}>
          {displayBand}
        </span>
      </div>

      {/* Attribution */}
      {isConfirmed && (
        <p className="text-[11px] text-[#B8B3CE]">
          {isOverridden ? 'Overridden' : 'Confirmed'}
          {confirmedBy ? ` · ${confirmedBy}` : ''}
          {confirmedAt ? ` · ${new Date(confirmedAt).toLocaleDateString('en-GB')}` : ''}
        </p>
      )}

      {/* Confirm/override buttons or form */}
      {canOverride && actionOpen === null && (
        <div className="flex gap-1.5">
          {!isConfirmed ? (
            <>
              <button
                onClick={() => { setSelectedBand(suggestedOverallBand as TrustBandOption); setNote(''); setActionOpen('confirm'); setError(null) }}
                className="text-[11px] font-medium text-white bg-[#27500A] hover:bg-[#1e3b07] px-2.5 py-1 rounded-lg transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => { setSelectedBand(suggestedOverallBand as TrustBandOption); setNote(''); setActionOpen('override'); setError(null) }}
                className="text-[11px] font-medium text-[#5B3FD4] hover:text-[#3C3489] border border-[#E2DFF0] bg-white hover:bg-[#F9F8FD] px-2.5 py-1 rounded-lg transition-colors"
              >
                Override
              </button>
            </>
          ) : (
            <button
              onClick={() => { setSelectedBand((confirmedOverallBand as TrustBandOption) ?? (suggestedOverallBand as TrustBandOption)); setNote(''); setActionOpen('override'); setError(null) }}
              className="text-[11px] font-medium text-[#5B3FD4] hover:text-[#3C3489]"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* Inline form */}
      {actionOpen !== null && (
        <div className="mt-1 rounded-xl bg-[#F9F8FD] border border-[#E2DFF0] px-4 py-3 space-y-2 w-64 text-left">
          <p className="text-[11px] uppercase tracking-[0.06em] text-[#5B3FD4] font-medium">
            {actionOpen === 'confirm' ? 'Confirm overall band' : 'Override overall band'}
          </p>
          <select
            value={selectedBand}
            onChange={e => setSelectedBand(e.target.value as TrustBandOption)}
            className="w-full rounded-lg border border-[#E2DFF0] px-2 py-1 text-[13px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
          >
            {TRUST_BAND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={selectedBand !== suggestedOverallBand ? 'Note required when overriding…' : 'Optional note…'}
            className="w-full rounded-lg border border-[#E2DFF0] px-2 py-1.5 text-[13px] text-[#1A1625] focus:outline-none focus:ring-1 focus:ring-[#5B3FD4] resize-none bg-white"
          />
          {error && <p className="text-[11px] text-[#791F1F]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 text-[12px] font-medium bg-[#5B3FD4] text-white rounded-lg hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : actionOpen === 'confirm' ? 'Confirm' : 'Save'}
            </button>
            <button
              onClick={() => { setActionOpen(null); setError(null); setNote('') }}
              className="px-2.5 py-1 text-[12px] font-medium text-[#5B3FD4] bg-white border border-[#E2DFF0] rounded-lg hover:bg-[#F9F8FD] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
