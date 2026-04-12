'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PipelineEvent {
  type: 'step' | 'complete' | 'error'
  step?: string
  status?: 'running' | 'done' | 'warn'
  message?: string
  assessmentId?: string
  riskTier?: string
  overallScore?: number
}

const STEP_LABELS: Record<string, string> = {
  companies_house: 'Companies House profile',
  gleif: 'GLEIF legal entity lookup',
  sanctions: 'Sanctions screening',
  news: 'News search',
  trust_portals: 'Trust portal check',
  ai_analysis: 'AI analysis',
  scoring: 'Risk scoring',
  summary: 'Executive summary',
  saving: 'Saving assessment',
}

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

interface Props {
  previousAssessmentId: string
  vendorName: string
  companiesHouseNumber?: string
}

export default function RegenerateFlow({ previousAssessmentId, vendorName }: Props) {
  const router = useRouter()
  const [pipelineSteps, setPipelineSteps] = useState<Map<string, PipelineEvent>>(new Map())
  const [flowState, setFlowState] = useState<'running' | 'complete' | 'error'>('running')
  const [completed, setCompleted] = useState<{ id: string; riskTier: string; overallScore: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      try {
        const res = await fetch(`/api/assessments/${previousAssessmentId}/regenerate`, { method: 'POST' })

        if (!res.ok) {
          const body = await res.json() as { error?: string }
          setErrorMsg(body.error ?? `Server error ${res.status}`)
          setFlowState('error')
          return
        }

        if (!res.body) { setErrorMsg('No response body'); setFlowState('error'); return }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as PipelineEvent
              if (event.type === 'step' && event.step) {
                setPipelineSteps((prev) => new Map(prev).set(event.step!, event))
              } else if (event.type === 'complete') {
                setCompleted({ id: event.assessmentId!, riskTier: event.riskTier!, overallScore: event.overallScore! })
                setFlowState('complete')
              } else if (event.type === 'error') {
                setErrorMsg(event.message ?? 'Unknown error')
                setFlowState('error')
              }
            } catch { /* malformed SSE */ }
          }
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Pipeline failed')
        setFlowState('error')
      }
    }

    run()
  }, [previousAssessmentId])

  if (flowState === 'complete' && completed) {
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 mx-auto flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Assessment complete</h2>
        <p className="text-sm text-gray-500">
          New assessment for <span className="font-medium">{vendorName}</span>
        </p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-sm text-gray-500">Risk tier:</span>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${TIER_COLORS[completed.riskTier] ?? 'bg-gray-100 text-gray-700'}`}>
            {completed.riskTier}
          </span>
          <span className="text-sm text-gray-400">Score: {completed.overallScore}/100</span>
        </div>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={() => router.push(`/assessments/${completed.id}`)}
            className="px-6 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            View new assessment
          </button>
          <button
            onClick={() => router.push(`/assessments/${previousAssessmentId}`)}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View previous
          </button>
        </div>
      </div>
    )
  }

  if (flowState === 'error') {
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-red-700">Assessment failed</h2>
        <p className="text-sm text-gray-600">{errorMsg}</p>
        <button
          onClick={() => router.push(`/assessments/${previousAssessmentId}`)}
          className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to assessment
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Re-running assessment…</h2>
        <p className="text-sm text-gray-500 mt-0.5">{vendorName}</p>
      </div>
      <div className="space-y-3">
        {Object.entries(STEP_LABELS).map(([key, label]) => {
          const event = pipelineSteps.get(key)
          const status = event?.status
          return (
            <div key={key} className="flex items-center gap-3">
              {!event ? (
                <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0" />
              ) : status === 'running' ? (
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : status === 'done' ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-amber-400 flex-shrink-0 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              )}
              <span className={`text-sm ${!event ? 'text-gray-400' : status === 'done' ? 'text-gray-700' : status === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
