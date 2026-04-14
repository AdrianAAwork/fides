'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface DoraRow {
  serviceType: string
  processesPersonalData: boolean
  lossImpactOver2hrs: boolean
  substituteAvailable: boolean
  regulatedActivitySubstitute: boolean
  classification: 'CRITICAL' | 'IMPORTANT' | 'STANDARD'
  classificationJustification: string
  isOverridden: boolean
  overrideReason: string | null
  overriddenAt: Date | string | null
}

interface Props {
  assessmentId: string
  existing: DoraRow | null
  canClassify: boolean  // ANALYST+
  canOverride: boolean  // ADMIN only
}

const SERVICE_TYPES = [
  'Cloud/hosting',
  'Software/SaaS',
  'Data/analytics',
  'Payment processing',
  'IT support/managed services',
  'Other',
]

const CLASS_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  IMPORTANT: 'bg-amber-100 text-amber-800 border-amber-200',
  STANDARD: 'bg-green-100 text-green-800 border-green-200',
}

const ANSWER_LABELS = {
  serviceType: 'Service type',
  processesPersonalData: 'Processes personal data',
  lossImpactOver2hrs: 'Unavailability impacts operations >2 hrs',
  substituteAvailable: 'Readily available substitute exists',
  regulatedActivitySubstitute: 'Supports directly regulated activity',
}

export default function DoraCard({ assessmentId, existing, canClassify, canOverride }: Props) {
  const router = useRouter()

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
  const [processesPersonalData, setProcessesPersonalData] = useState<boolean>(false)
  const [lossImpact, setLossImpact] = useState<'yes' | 'no' | 'unsure'>('no')
  const [substituteAvail, setSubstituteAvail] = useState<'yes' | 'no' | 'unsure'>('no')
  const [regulatedActivity, setRegulatedActivity] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Admin override state
  const [showOverride, setShowOverride] = useState(false)
  const [overrideClass, setOverrideClass] = useState<'CRITICAL' | 'IMPORTANT' | 'STANDARD'>('IMPORTANT')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  async function handleSubmit() {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/dora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType,
          processesPersonalData,
          lossImpactOver2hrs: lossImpact === 'yes' || lossImpact === 'unsure',
          substituteAvailable: substituteAvail === 'yes',
          regulatedActivity,
        }),
      })
      if (!res.ok) {
        const b = await res.json() as { error?: string }
        setFormError(b.error ?? 'Save failed')
        return
      }
      setShowForm(false)
      router.refresh()
    } catch {
      setFormError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleOverride() {
    if (overrideReason.trim().length < 10) {
      setOverrideError('Reason must be at least 10 characters')
      return
    }
    setOverrideSaving(true)
    setOverrideError(null)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/dora`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification: overrideClass, reason: overrideReason.trim() }),
      })
      if (!res.ok) {
        const b = await res.json() as { error?: string }
        setOverrideError(b.error ?? 'Override failed')
        return
      }
      setShowOverride(false)
      setOverrideReason('')
      router.refresh()
    } catch {
      setOverrideError('Network error')
    } finally {
      setOverrideSaving(false)
    }
  }

  // ── Pending state ─────────────────────────────────────────────────────────

  if (!existing) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">DORA / FCA classification</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Pending</span>
        </div>

        {!showForm ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Complete the classification questionnaire to determine whether this vendor meets the criteria for DORA
              Article 28 or FCA outsourcing guidance SS2/21 oversight requirements.
            </p>
            {canClassify && (
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                Start classification
              </button>
            )}
          </div>
        ) : (
          <IntakeForm
            serviceType={serviceType} setServiceType={setServiceType}
            processesPersonalData={processesPersonalData} setProcessesPersonalData={setProcessesPersonalData}
            lossImpact={lossImpact} setLossImpact={setLossImpact}
            substituteAvail={substituteAvail} setSubstituteAvail={setSubstituteAvail}
            regulatedActivity={regulatedActivity} setRegulatedActivity={setRegulatedActivity}
            saving={saving} error={formError}
            onSave={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>
    )
  }

  // ── Completed state ───────────────────────────────────────────────────────

  const answers = [
    { label: ANSWER_LABELS.serviceType, value: existing.serviceType },
    { label: ANSWER_LABELS.processesPersonalData, value: existing.processesPersonalData ? 'Yes' : 'No' },
    { label: ANSWER_LABELS.lossImpactOver2hrs, value: existing.lossImpactOver2hrs ? 'Yes' : 'No' },
    { label: ANSWER_LABELS.substituteAvailable, value: existing.substituteAvailable ? 'Yes' : 'No' },
    { label: ANSWER_LABELS.regulatedActivitySubstitute, value: existing.regulatedActivitySubstitute ? 'Yes' : 'No' },
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-5">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-gray-900">DORA / FCA classification</h2>
        <div className="flex items-center gap-2">
          {existing.isOverridden && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
              Manually adjusted
            </span>
          )}
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${CLASS_COLORS[existing.classification]}`}>
            {existing.classification}
          </span>
        </div>
      </div>

      {/* Override banner */}
      {existing.isOverridden && existing.overrideReason && (
        <div className="rounded-md bg-purple-50 border border-purple-100 px-3 py-2 text-xs">
          <p className="font-medium text-purple-700">Classification manually adjusted by admin</p>
          <p className="text-purple-600 mt-0.5">{existing.overrideReason}</p>
          {existing.overriddenAt && (
            <p className="text-purple-400 mt-0.5">{new Date(existing.overriddenAt).toLocaleString('en-GB')}</p>
          )}
        </div>
      )}

      {/* Justification */}
      <p className="text-sm text-gray-700 leading-relaxed">{existing.classificationJustification}</p>

      {/* Answer summary */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Classification basis</p>
        <div className="divide-y divide-gray-50 rounded-md border border-gray-100 overflow-hidden">
          {answers.map((a) => (
            <div key={a.label} className="flex items-center justify-between px-3 py-2 text-xs bg-white">
              <span className="text-gray-600">{a.label}</span>
              <span className="font-medium text-gray-900">{a.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Article references */}
      <div className="flex flex-wrap gap-3">
        <a
          href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          DORA Article 28
        </a>
        <a
          href="https://www.fca.org.uk/publications/supervisory-statements/ss2-21-outsourcing-and-third-party-risk-management"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          FCA outsourcing guidance SS2/21
        </a>
        {canClassify && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {showForm ? 'Cancel re-classification' : 'Re-classify'}
          </button>
        )}
      </div>

      {/* Re-classify form */}
      {showForm && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Update classification answers</p>
          <IntakeForm
            serviceType={serviceType} setServiceType={setServiceType}
            processesPersonalData={processesPersonalData} setProcessesPersonalData={setProcessesPersonalData}
            lossImpact={lossImpact} setLossImpact={setLossImpact}
            substituteAvail={substituteAvail} setSubstituteAvail={setSubstituteAvail}
            regulatedActivity={regulatedActivity} setRegulatedActivity={setRegulatedActivity}
            saving={saving} error={formError}
            onSave={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Admin override */}
      {canOverride && !showForm && (
        <div className="pt-2 border-t border-gray-100">
          {!showOverride ? (
            <button
              onClick={() => setShowOverride(true)}
              className="text-xs text-gray-400 hover:text-purple-600 underline"
            >
              Override classification (admin)
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Override classification</p>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-600">New classification</label>
                <select
                  value={overrideClass}
                  onChange={(e) => setOverrideClass(e.target.value as 'CRITICAL' | 'IMPORTANT' | 'STANDARD')}
                  className="rounded border border-gray-300 text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="IMPORTANT">IMPORTANT</option>
                  <option value="STANDARD">STANDARD</option>
                </select>
              </div>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for override (minimum 10 characters)"
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {overrideError && <p className="text-xs text-red-600">{overrideError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleOverride}
                  disabled={overrideSaving}
                  className="px-3 py-1.5 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {overrideSaving ? 'Saving…' : 'Save override'}
                </button>
                <button
                  onClick={() => { setShowOverride(false); setOverrideReason(''); setOverrideError(null) }}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Intake form sub-component ────────────────────────────────────────────────

interface IntakeFormProps {
  serviceType: string
  setServiceType: (v: string) => void
  processesPersonalData: boolean
  setProcessesPersonalData: (v: boolean) => void
  lossImpact: 'yes' | 'no' | 'unsure'
  setLossImpact: (v: 'yes' | 'no' | 'unsure') => void
  substituteAvail: 'yes' | 'no' | 'unsure'
  setSubstituteAvail: (v: 'yes' | 'no' | 'unsure') => void
  regulatedActivity: boolean
  setRegulatedActivity: (v: boolean) => void
  saving: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
}

function IntakeForm({
  serviceType, setServiceType,
  processesPersonalData, setProcessesPersonalData,
  lossImpact, setLossImpact,
  substituteAvail, setSubstituteAvail,
  regulatedActivity, setRegulatedActivity,
  saving, error, onSave, onCancel,
}: IntakeFormProps) {
  return (
    <div className="space-y-4">
      {/* Q1 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Q1. What type of service does this vendor provide?
        </label>
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Q2 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-1">
          Q2. Does this vendor process, store or transmit personal data on your behalf?
        </legend>
        <div className="flex gap-4">
          {(['Yes', 'No'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="q2"
                checked={processesPersonalData === (opt === 'Yes')}
                onChange={() => setProcessesPersonalData(opt === 'Yes')}
                className="accent-indigo-600"
              />
              {opt}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Q3 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-1">
          Q3. If this vendor became unavailable, would it impact your operations for more than 2 hours?
        </legend>
        <p className="text-xs text-gray-400 mb-1">If unsure, a conservative &ldquo;Yes&rdquo; is assumed.</p>
        <div className="flex gap-4">
          {(['yes', 'no', 'unsure'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="q3"
                checked={lossImpact === opt}
                onChange={() => setLossImpact(opt)}
                className="accent-indigo-600"
              />
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Q4 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-1">
          Q4. Is there a readily available alternative vendor you could switch to within 1 month?
        </legend>
        <p className="text-xs text-gray-400 mb-1">If unsure, a conservative &ldquo;No&rdquo; is assumed.</p>
        <div className="flex gap-4">
          {(['yes', 'no', 'unsure'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="q4"
                checked={substituteAvail === opt}
                onChange={() => setSubstituteAvail(opt)}
                className="accent-indigo-600"
              />
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Q5 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-1">
          Q5. Does this vendor perform or support any activity that is directly regulated (e.g. payment processing, credit decisions, regulated reporting)?
        </legend>
        <div className="flex gap-4">
          {(['Yes', 'No'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="q5"
                checked={regulatedActivity === (opt === 'Yes')}
                onChange={() => setRegulatedActivity(opt === 'Yes')}
                className="accent-indigo-600"
              />
              {opt}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save classification'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
