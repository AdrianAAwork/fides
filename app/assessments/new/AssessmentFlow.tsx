'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ChResult {
  company_name: string
  company_number: string
  company_status: string
  address_snippet?: string
}

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

type FlowStep = 'search' | 'running' | 'complete' | 'error'

export default function AssessmentFlow() {
  const router = useRouter()
  const [flowStep, setFlowStep] = useState<FlowStep>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState<ChResult | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [pipelineSteps, setPipelineSteps] = useState<Map<string, PipelineEvent>>(new Map())
  const [completedAssessment, setCompletedAssessment] = useState<{
    id: string
    riskTier: string
    overallScore: number
  } | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const skipSearchRef = useRef(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }
    // Cancel any in-flight request so stale results never overwrite newer ones
    searchAbortRef.current?.abort()
    searchAbortRef.current = new AbortController()
    const signal = searchAbortRef.current.signal
    setSearching(true)
    try {
      const res = await fetch(`/api/companies-house/search?q=${encodeURIComponent(q)}`, { signal })
      if (!res.ok) return
      const data = await res.json() as { items?: ChResult[] }
      setResults(data.items ?? [])
      setShowDropdown(true)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // ignore other errors
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    // Selecting a company updates `query` but must not re-trigger a search
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => search(query), 300)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [query, search])

  function selectCompany(result: ChResult) {
    // Suppress the useEffect search that would fire because query is about to change
    skipSearchRef.current = true
    searchAbortRef.current?.abort()
    setSelected(result)
    setQuery(result.company_name)
    setShowDropdown(false)
  }

  async function startPipeline(vendorName: string, companiesHouseNumber?: string) {
    setFlowStep('running')
    setPipelineSteps(new Map())
    setPipelineError(null)

    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorName, companiesHouseNumber }),
      })

      if (!res.ok) {
        let errMsg = `Server error ${res.status}`
        try {
          const errBody = await res.json() as { error?: string }
          if (errBody.error) errMsg = errBody.error
        } catch { /* ignore parse failure */ }
        throw new Error(errMsg)
      }

      if (!res.body) throw new Error('No response body')

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
              setCompletedAssessment({
                id: event.assessmentId!,
                riskTier: event.riskTier!,
                overallScore: event.overallScore!,
              })
              setFlowStep('complete')
            } else if (event.type === 'error') {
              setPipelineError(event.message ?? 'Unknown error')
              setFlowStep('error')
            }
          } catch {
            // malformed SSE line
          }
        }
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Pipeline failed')
      setFlowStep('error')
    }
  }

  function handleConfirm() {
    if (manualMode) {
      if (!manualName.trim()) return
      startPipeline(manualName.trim())
    } else if (selected) {
      startPipeline(selected.company_name, selected.company_number)
    }
  }

  // ─── Step 1: Search ───────────────────────────────────────────────────────

  if (flowStep === 'search') {
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Search for a vendor</h2>
          <p className="text-sm text-gray-500">
            Enter a company name to search the Companies House register.
          </p>
        </div>

        {!manualMode ? (
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelected(null)
                }}
                placeholder="e.g. Acme Ltd"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              )}

              {showDropdown && results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.company_number}
                      onClick={() => selectCompany(r)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{r.company_name}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.company_status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {r.company_status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {r.company_number}
                        {r.address_snippet ? ` · ${r.address_snippet}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-sm font-medium text-indigo-800">{selected.company_name}</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  CH: {selected.company_number} · {selected.company_status}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setManualMode(true)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Can&apos;t find the company?
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selected}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
              >
                Start assessment
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor name</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Enter vendor name"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Assessment will run without a Companies House number.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setManualMode(false)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Back to search
              </button>
              <button
                onClick={handleConfirm}
                disabled={!manualName.trim()}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
              >
                Start assessment
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Step 2: Running ──────────────────────────────────────────────────────

  if (flowStep === 'running') {
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Running assessment…</h2>
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

  // ─── Step 3: Complete ─────────────────────────────────────────────────────

  if (flowStep === 'complete' && completedAssessment) {
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 mx-auto flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Assessment complete</h2>
        <div className="flex items-center justify-center gap-3">
          <span className="text-sm text-gray-500">Risk tier:</span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
              TIER_COLORS[completedAssessment.riskTier] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {completedAssessment.riskTier}
          </span>
          <span className="text-sm text-gray-400">Score: {completedAssessment.overallScore}/100</span>
        </div>
        <button
          onClick={() => router.push(`/assessments/${completedAssessment.id}`)}
          className="mt-2 px-6 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          View assessment
        </button>
      </div>
    )
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 className="text-lg font-semibold text-red-700">Assessment failed</h2>
      <p className="text-sm text-gray-600">{pipelineError}</p>
      <button
        onClick={() => setFlowStep('search')}
        className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
      >
        Try again
      </button>
    </div>
  )
}
