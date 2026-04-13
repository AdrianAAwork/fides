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

const DATA_SOURCES = [
  { icon: '🏛', label: 'Companies House', desc: 'Company profile, filings & accounts' },
  { icon: '🌐', label: 'GLEIF', desc: 'Legal entity identifier & ownership' },
  { icon: '🔍', label: 'Sanctions', desc: 'OFSI, OFAC & EU sanctions lists' },
  { icon: '📰', label: 'NewsAPI + Claude AI', desc: 'Recent press sentiment analysis' },
  { icon: '🔒', label: 'Trust portals', desc: 'NCSC, Vanta & SafeBase certifications' },
  { icon: '⚠️', label: 'Have I Been Pwned', desc: 'Data breach history' },
]

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-[#E6F1FB] text-[#0C447C]',
  MEDIUM: 'bg-[#EAF3DE] text-[#27500A]',
  HIGH: 'bg-[#FAEEDA] text-[#633806]',
  CRITICAL: 'bg-[#FCEBEB] text-[#791F1F]',
}

type FlowStep = 'search' | 'running' | 'complete' | 'error'

interface AssessmentFlowProps {
  prefill?: string
}

export default function AssessmentFlow({ prefill }: AssessmentFlowProps) {
  const router = useRouter()
  const [flowStep, setFlowStep] = useState<FlowStep>('search')
  const [query, setQuery] = useState(prefill ?? '')
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
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => search(query), 300)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [query, search])

  function selectCompany(result: ChResult) {
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
        } catch { /* ignore */ }
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
          } catch { /* malformed SSE */ }
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

  // ─── Search ───────────────────────────────────────────────────────────────

  if (flowStep === 'search') {
    return (
      <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-5">
        <div>
          <h2 className="text-[15px] font-medium text-[#1A1625] mb-1">Search for a vendor</h2>
          <p className="text-[13px] text-[#8B85A8]">
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
                className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-[#5B3FD4] border-t-transparent rounded-full animate-spin" />
              )}

              {showDropdown && results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-[#E2DFF0] rounded-xl shadow-lg max-h-72 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.company_number}
                      onClick={() => selectCompany(r)}
                      className="w-full text-left px-4 py-3 hover:bg-[#F9F8FD] border-b border-[#E2DFF0] last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-medium text-[#1A1625]">{r.company_name}</span>
                        <span className={`text-[12px] px-2 py-0.5 rounded-full ${
                          r.company_status === 'active'
                            ? 'bg-[#EAF3DE] text-[#27500A]'
                            : 'bg-[#F9F8FD] text-[#8B85A8]'
                        }`}>
                          {r.company_status}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#B8B3CE] mt-0.5">
                        {r.company_number}
                        {r.address_snippet ? ` · ${r.address_snippet}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#E2DFF0] bg-[#F9F8FD] px-4 py-3">
                  <p className="text-[14px] font-medium text-[#1A1625]">{selected.company_name}</p>
                  <p className="text-[12px] text-[#8B85A8] mt-0.5">
                    CH: {selected.company_number} · {selected.company_status}
                  </p>
                </div>

                {/* Data sources that will be checked */}
                <div>
                  <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-3">
                    Data sources that will be checked
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {DATA_SOURCES.map((source) => (
                      <div key={source.label} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#F9F8FD] border border-[#E2DFF0]">
                        <span className="text-base leading-none mt-0.5">{source.icon}</span>
                        <div>
                          <p className="text-[13px] font-medium text-[#1A1625]">{source.label}</p>
                          <p className="text-[11px] text-[#8B85A8]">{source.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setManualMode(true)}
                className="text-[13px] text-[#8B85A8] hover:text-[#5B5478] underline"
              >
                Can&apos;t find the company?
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selected}
                className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-40 transition-colors"
              >
                Start assessment
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#5B5478] mb-1">Vendor name</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Enter vendor name"
                className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:border-transparent"
                autoFocus
              />
              <p className="text-[12px] text-[#B8B3CE] mt-1">
                Assessment will run without a Companies House number.
              </p>
            </div>

            {manualName.trim() && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-3">
                  Data sources that will be checked
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DATA_SOURCES.map((source) => (
                    <div key={source.label} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#F9F8FD] border border-[#E2DFF0]">
                      <span className="text-base leading-none mt-0.5">{source.icon}</span>
                      <div>
                        <p className="text-[13px] font-medium text-[#1A1625]">{source.label}</p>
                        <p className="text-[11px] text-[#8B85A8]">{source.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setManualMode(false)}
                className="text-[13px] text-[#8B85A8] hover:text-[#5B5478] underline"
              >
                Back to search
              </button>
              <button
                onClick={handleConfirm}
                disabled={!manualName.trim()}
                className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] disabled:opacity-40 transition-colors"
              >
                Start assessment
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Running ──────────────────────────────────────────────────────────────

  if (flowStep === 'running') {
    return (
      <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-4">
        <h2 className="text-[15px] font-medium text-[#1A1625]">Running assessment…</h2>
        <div className="space-y-3">
          {Object.entries(STEP_LABELS).map(([key, label]) => {
            const event = pipelineSteps.get(key)
            const status = event?.status
            return (
              <div key={key} className="flex items-center gap-3">
                {!event ? (
                  <div className="w-5 h-5 rounded-full border-2 border-[#E2DFF0] flex-shrink-0" />
                ) : status === 'running' ? (
                  <div className="w-5 h-5 border-2 border-[#5B3FD4] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : status === 'done' ? (
                  <div className="w-5 h-5 rounded-full bg-[#3B6D11] flex-shrink-0 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#BA7517] flex-shrink-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                )}
                <span className={`text-[14px] ${
                  !event ? 'text-[#B8B3CE]'
                  : status === 'done' ? 'text-[#5B5478]'
                  : status === 'warn' ? 'text-[#633806]'
                  : 'text-[#1A1625]'
                }`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Complete ─────────────────────────────────────────────────────────────

  if (flowStep === 'complete' && completedAssessment) {
    return (
      <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-8 space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-[#EAF3DE] mx-auto flex items-center justify-center">
          <svg className="w-6 h-6 text-[#27500A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-[15px] font-medium text-[#1A1625]">Assessment complete</h2>
        <div className="flex items-center justify-center gap-3">
          <span className="text-[13px] text-[#8B85A8]">Risk tier:</span>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[14px] font-medium ${
            TIER_COLORS[completedAssessment.riskTier] ?? 'bg-[#F9F8FD] text-[#5B5478]'
          }`}>
            {completedAssessment.riskTier}
          </span>
          <span className="text-[13px] text-[#8B85A8]">Score: {completedAssessment.overallScore}/100</span>
        </div>
        <button
          onClick={() => router.push(`/assessments/${completedAssessment.id}`)}
          className="mt-2 px-6 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors"
        >
          View assessment
        </button>
      </div>
    )
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-4">
      <h2 className="text-[15px] font-medium text-[#791F1F]">Assessment failed</h2>
      <p className="text-[14px] text-[#5B5478]">{pipelineError}</p>
      <button
        onClick={() => setFlowStep('search')}
        className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
