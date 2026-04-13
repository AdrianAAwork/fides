'use client'

import { useState } from 'react'

interface Props {
  assessmentId: string
  showPrimary: boolean
  hasExistingQuestionnaire: boolean
}

export default function QuestionnaireButton({ assessmentId, showPrimary, hasExistingQuestionnaire }: Props) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/questionnaire`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to generate questionnaire')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      a.download = match?.[1] ?? 'questionnaire.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Network error — please try again')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleGenerate}
        disabled={generating}
        className={
          showPrimary
            ? 'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-50 transition-colors shadow-sm'
            : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E2DFF0] bg-white text-[13px] text-[#5B3FD4] font-medium hover:bg-[#F4F3F8] disabled:opacity-50 transition-colors'
        }
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {generating
          ? 'Generating…'
          : hasExistingQuestionnaire
            ? 'Regenerate questionnaire'
            : showPrimary
              ? 'Generate due diligence questionnaire'
              : 'Generate due diligence questionnaire'}
      </button>
      {showPrimary && !generating && (
        <p className="text-[11px] text-[#8B85A8]">
          One or more risk indicators suggest a questionnaire is recommended for this vendor.
        </p>
      )}
      {error && <p className="text-[12px] text-[#791F1F]">{error}</p>}
    </div>
  )
}
