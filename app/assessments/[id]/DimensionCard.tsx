'use client'

import { useState } from 'react'
import { FATF_GREY_LIST, FATF_BLACK_LIST } from '@/src/lib/fatf'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  dimension: string
  label: string
  weight: number
  finalScore: number
  isOverridden: boolean
  overrideReason: string | null
  sourceData: Record<string, unknown> | null
  fetchedAt: Date | string | null
}

type StepType = 'base' | 'deduction' | 'positive' | 'info' | 'warning'
interface Step { text: string; type: StepType }

// ── Lookups ───────────────────────────────────────────────────────────────────

const CERT_LABELS: Record<string, string> = {
  SOC2_TYPE_I: 'SOC 2 Type I',
  SOC2_TYPE_II: 'SOC 2 Type II',
  ISO_27001: 'ISO 27001',
  ISO_22301: 'ISO 22301',
  ISO_27701: 'ISO 27701',
  CYBER_ESSENTIALS: 'Cyber Essentials',
  CYBER_ESSENTIALS_PLUS: 'Cyber Essentials Plus',
  PCI_DSS: 'PCI DSS',
  CSA_STAR: 'CSA STAR',
  OTHER: 'Other certification',
}

const PORTAL_LABELS: Record<string, string> = {
  ncsc: 'NCSC Cyber Essentials registry',
  vanta: 'Vanta trust portal',
  safebase: 'SafeBase portal',
  vendor_site: 'Vendor website',
}

const SOURCE_LABELS: Record<string, string> = {
  FINANCIAL_HEALTH: 'Companies House',
  BREACH_HISTORY: 'Have I Been Pwned (HIBP)',
  SANCTIONS: 'OFSI · OFAC · EU (Neon DB)',
  OWNERSHIP: 'GLEIF',
  TRUST_CERTS: 'NCSC · Vanta · SafeBase · vendor website',
  NEWS_SENTIMENT: 'NewsAPI + Claude AI',
}

const HIGH_JURISDICTIONS = new Set([
  'GB','US','AU','CA','JP','CH','NO','NZ','SG',
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK',
])

// ── Score colour ──────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 75) return 'text-green-600'
  if (s >= 50) return 'text-amber-600'
  if (s >= 25) return 'text-orange-600'
  return 'text-red-600'
}

// ── Explanation builders ──────────────────────────────────────────────────────

function explainFinancialHealth(sd: Record<string, unknown>, score: number): Step[] {
  const steps: Step[] = [{ text: 'Started at 100.', type: 'base' }]

  const status = sd.company_status as string | undefined
  if (status && status !== 'active') {
    steps.push({ text: `Company status is "${status}" (not active): −60`, type: 'deduction' })
  } else if (status === 'active') {
    steps.push({ text: 'Company status: active.', type: 'positive' })
  }

  const acc = sd.accounts as { overdue?: boolean; next_due?: string } | undefined
  if (acc?.overdue) {
    steps.push({ text: 'Annual accounts are overdue: −40', type: 'deduction' })
  } else if (acc?.next_due) {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 18)
    if (new Date(acc.next_due) < cutoff) {
      steps.push({ text: `No accounts filed in last 18 months (next due: ${acc.next_due}): −30`, type: 'deduction' })
    } else {
      steps.push({ text: `Annual accounts next due: ${acc.next_due}. Up to date.`, type: 'positive' })
    }
  } else {
    steps.push({ text: 'No accounts information available.', type: 'info' })
  }

  const cs = sd.confirmation_statement as { overdue?: boolean; next_due?: string } | undefined
  if (cs?.overdue) {
    steps.push({ text: 'Confirmation statement is overdue: −20', type: 'deduction' })
  } else if (cs?.next_due) {
    steps.push({ text: `Confirmation statement next due: ${cs.next_due}. Up to date.`, type: 'positive' })
  }

  const gc = sd.going_concern as {
    going_concern?: boolean; status?: string; confidence?: string; summary?: string
  } | undefined
  if (gc?.status === 'checked') {
    if (gc.going_concern) {
      steps.push({ text: `Going concern warning detected (AI confidence: ${gc.confidence}): −30`, type: 'deduction' })
      if (gc.summary) steps.push({ text: `AI note: "${gc.summary}"`, type: 'warning' })
    } else {
      steps.push({ text: 'No going concern warning found in filing text.', type: 'positive' })
    }
  } else if (gc?.status === 'not_checked') {
    steps.push({ text: 'Going concern: filing text not available for AI analysis.', type: 'info' })
  } else if (gc?.status === 'summary_unavailable') {
    steps.push({ text: 'Going concern: AI analysis was unavailable, skipped.', type: 'info' })
  }

  if (sd.error) steps.push({ text: `Data fetch error: ${sd.error}`, type: 'warning' })
  steps.push({ text: `Final score: ${score}`, type: 'base' })
  return steps
}

function explainBreachHistory(sd: Record<string, unknown>, score: number): Step[] {
  if (!sd.enabled) {
    return [
      { text: 'HIBP breach checking is not enabled for this deployment.', type: 'info' },
      { text: 'A neutral score of 75 was applied.', type: 'info' },
    ]
  }

  const steps: Step[] = [{ text: 'Started at 100.', type: 'base' }]
  const breaches = (sd.breaches as Array<{ Name: string; BreachDate: string; DataClasses?: string[] }>) ?? []
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24)

  if (breaches.length === 0) {
    steps.push({ text: 'No breaches found on the domain.', type: 'positive' })
  } else {
    for (const b of breaches) {
      const recent = new Date(b.BreachDate) >= cutoff
      const classes = b.DataClasses?.slice(0, 3).join(', ')
      steps.push({
        text: `"${b.Name}" (${b.BreachDate})${classes ? ` — ${classes}` : ''}: ${recent ? '−25 (within 24 months)' : '−10 (older than 24 months)'}`,
        type: 'deduction',
      })
    }
  }

  if (sd.error) steps.push({ text: `Data fetch error: ${sd.error}`, type: 'warning' })
  steps.push({ text: `Final score: ${score}`, type: 'base' })
  return steps
}

function explainSanctions(sd: Record<string, unknown>): Step[] {
  const screened = (sd.screened as string[]) ?? []
  const matches = (sd.matches as Array<{
    name: string; matchedAgainst: string; similarity: number; level: string; source: string
  }>) ?? []
  const steps: Step[] = []

  steps.push({
    text: `Screened ${screened.length} name${screened.length !== 1 ? 's' : ''} against OFSI, OFAC, and EU sanctions lists.`,
    type: 'info',
  })

  if (matches.length === 0) {
    steps.push({ text: 'No matches found. Score: 100.', type: 'positive' })
  } else {
    const confirmed = matches.filter(m => m.level === 'confirmed')
    const possible  = matches.filter(m => m.level === 'possible')
    if (confirmed.length) steps.push({ text: `${confirmed.length} confirmed match(es). Score forced to 0. Risk tier overridden to minimum HIGH.`, type: 'deduction' })
    if (possible.length)  steps.push({ text: `${possible.length} possible match(es). Score set to 40. Risk tier overridden to minimum HIGH.`, type: 'warning' })
  }

  if (sd.error) steps.push({ text: `Screening error: ${sd.error}`, type: 'warning' })
  return steps
}

function explainOwnership(sd: Record<string, unknown>, score: number): Step[] {
  const steps: Step[] = []
  const lei          = sd.lei as string | undefined
  const legalName    = sd.legalName as string | undefined
  const jurisdiction = sd.jurisdiction as string | undefined
  const status       = sd.status as string | undefined
  const parent       = sd.ultimateParent as { lei?: string; name?: string } | undefined

  if (!lei) {
    steps.push({ text: 'No GLEIF record found for this company.', type: 'info' })
  } else {
    steps.push({ text: `GLEIF record found. LEI: ${lei}`, type: 'positive' })
    if (legalName) steps.push({ text: `Legal name on record: ${legalName}`, type: 'info' })
    if (status)    steps.push({ text: `Entity status: ${status}`, type: status === 'ACTIVE' ? 'positive' : 'warning' })
  }

  if (jurisdiction) {
    const jUp = jurisdiction.toUpperCase()
    const jLo = jurisdiction.toLowerCase()
    if (HIGH_JURISDICTIONS.has(jUp)) {
      steps.push({ text: `Jurisdiction "${jurisdiction}" is a high-trust jurisdiction (UK/US/EU/equivalent): score 95.`, type: 'positive' })
    } else if (FATF_BLACK_LIST.some(c => jLo.includes(c.toLowerCase()))) {
      steps.push({ text: `Jurisdiction "${jurisdiction}" is on the FATF black list: score 10.`, type: 'deduction' })
    } else if (FATF_GREY_LIST.some(c => jLo.includes(c.toLowerCase()))) {
      steps.push({ text: `Jurisdiction "${jurisdiction}" is on the FATF grey list: score 40.`, type: 'warning' })
    } else {
      steps.push({ text: `Jurisdiction "${jurisdiction}" is a FATF member in good standing: score 65.`, type: 'info' })
    }
  } else {
    steps.push({ text: 'Jurisdiction unknown — defaulting to score 40.', type: 'info' })
  }

  if (parent?.name) steps.push({ text: `Ultimate parent: ${parent.name}${parent.lei ? ` (LEI: ${parent.lei})` : ''}`, type: 'info' })
  if (sd.error)     steps.push({ text: `GLEIF lookup error: ${sd.error}`, type: 'warning' })
  steps.push({ text: `Final score: ${score}`, type: 'base' })
  return steps
}

function explainTrustCerts(sd: Record<string, unknown>, score: number): Step[] {
  const certs  = (sd.certs_found as Array<{ certType: string; source: string; expiryDate?: string }>) ?? []
  const status = sd.status as string | undefined
  const steps: Step[] = []

  if (certs.length === 0) {
    if (status === 'inconclusive') {
      steps.push({ text: 'No certifications detected after checking all automated sources.', type: 'warning' })
      steps.push({ text: 'Status is inconclusive — base score: 25. Manual verification recommended.', type: 'warning' })
    } else {
      steps.push({ text: 'No certifications found across all sources.', type: 'info' })
      steps.push({ text: 'Base score: 15.', type: 'info' })
    }
  } else {
    steps.push({ text: `${certs.length} certification${certs.length !== 1 ? 's' : ''} found. Scoring starts at 0 and accumulates.`, type: 'base' })
    const CERT_POINTS: Record<string, number> = {
      SOC2_TYPE_II: 40, ISO_27001: 30, CYBER_ESSENTIALS_PLUS: 20,
      CYBER_ESSENTIALS: 15, ISO_22301: 10,
    }
    for (const cert of certs) {
      const pts = CERT_POINTS[cert.certType] ?? 15
      const label = CERT_LABELS[cert.certType] ?? cert.certType
      steps.push({
        text: `${label} via ${cert.source}${cert.expiryDate ? ` (expires ${cert.expiryDate})` : ''}: +${pts}`,
        type: 'positive',
      })
    }
    steps.push({ text: `Final score: ${score} (capped at 100).`, type: 'base' })
  }

  if (sd.error) steps.push({ text: `Error during portal checks: ${sd.error}`, type: 'warning' })
  return steps
}

function explainNewsSentiment(sd: Record<string, unknown>): Step[] {
  const status    = sd.status as string | undefined
  const sentiment = sd.sentiment as string | undefined
  const summary   = sd.summary as string | undefined
  const items     = (sd.risk_items as Array<{ headline: string; risk_type: string }>) ?? []
  const steps: Step[] = []

  if (status === 'not_checked') {
    steps.push({ text: 'No news articles available. Neutral score of 70 applied.', type: 'info' })
    return steps
  }
  if (status === 'summary_unavailable') {
    steps.push({ text: 'AI news analysis unavailable. Neutral score of 70 applied.', type: 'info' })
    return steps
  }

  const sentimentScores: Record<string, number> = { positive: 90, neutral: 70, mixed: 50, negative: 20 }
  if (sentiment) {
    const t: StepType = sentiment === 'negative' ? 'deduction' : sentiment === 'positive' ? 'positive' : 'info'
    steps.push({ text: `AI assessed overall sentiment as "${sentiment}": score ${sentimentScores[sentiment] ?? 70}.`, type: t })
  }
  if (summary) steps.push({ text: `AI summary: "${summary}"`, type: 'info' })

  if (items.length === 0) {
    steps.push({ text: 'No specific risk items identified in headlines.', type: 'positive' })
  } else {
    steps.push({ text: `${items.length} risk item${items.length !== 1 ? 's' : ''} identified in headlines:`, type: 'warning' })
    for (const item of items.slice(0, 5)) {
      steps.push({ text: `"${item.headline}" [${item.risk_type}]`, type: 'warning' })
    }
    if (items.length > 5) steps.push({ text: `…and ${items.length - 5} more`, type: 'info' })
  }

  return steps
}

function getSteps(dim: string, sd: Record<string, unknown> | null, score: number): Step[] {
  const d = sd ?? {}
  switch (dim) {
    case 'FINANCIAL_HEALTH': return explainFinancialHealth(d, score)
    case 'BREACH_HISTORY':   return explainBreachHistory(d, score)
    case 'SANCTIONS':        return explainSanctions(d)
    case 'OWNERSHIP':        return explainOwnership(d, score)
    case 'TRUST_CERTS':      return explainTrustCerts(d, score)
    case 'NEWS_SENTIMENT':   return explainNewsSentiment(d)
    default: return [{ text: 'No explanation available.', type: 'info' }]
  }
}

// ── Step icon helper ──────────────────────────────────────────────────────────

function StepIcon({ type }: { type: StepType }) {
  if (type === 'deduction') return <span className="text-red-500 font-bold leading-none mt-0.5 flex-shrink-0">↓</span>
  if (type === 'positive')  return <span className="text-green-500 font-bold leading-none mt-0.5 flex-shrink-0">✓</span>
  if (type === 'warning')   return <span className="text-amber-500 font-bold leading-none mt-0.5 flex-shrink-0">!</span>
  if (type === 'base')      return <span className="text-gray-400 leading-none mt-0.5 flex-shrink-0">—</span>
  return <span className="text-gray-300 leading-none mt-0.5 flex-shrink-0">·</span>
}

function stepTextColor(type: StepType): string {
  if (type === 'deduction') return 'text-red-700'
  if (type === 'positive')  return 'text-green-700'
  if (type === 'warning')   return 'text-amber-700'
  if (type === 'base')      return 'text-gray-900 font-medium'
  return 'text-gray-600'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DimensionCard({
  dimension, label, weight, finalScore, isOverridden, overrideReason, sourceData, fetchedAt,
}: Props) {
  const [open, setOpen] = useState(false)
  const sd      = sourceData ?? {}
  const source  = SOURCE_LABELS[dimension] ?? 'Unknown'
  const fetched = fetchedAt ? new Date(fetchedAt).toLocaleString('en-GB') : null

  // Lazy-compute steps only when expanded
  const steps = open ? getSteps(dimension, sourceData, finalScore) : []

  // Sanctions and Trust-certs have extra detail sections
  const sanctionsMatches = dimension === 'SANCTIONS'
    ? ((sd.matches as Array<{ name: string; matchedAgainst: string; similarity: number; level: string; source: string }>) ?? [])
    : []
  const sanctionsScreened = dimension === 'SANCTIONS'
    ? ((sd.screened as string[]) ?? [])
    : []
  const scrapeMeta = dimension === 'TRUST_CERTS'
    ? (sd.scrape_metadata as Record<string, { attempted: boolean; http_status?: number; found: boolean; keywords_found?: string[]; error?: string | null }> | undefined)
    : undefined

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* ── Collapsed header ───────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 pt-5 pb-4 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {weight}%
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="flex items-baseline gap-2 mt-3">
          <span className={`text-3xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</span>
          <span className="text-sm text-gray-400">/100</span>
          {isOverridden && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              Overridden
            </span>
          )}
        </div>

        {fetched && (
          <p className="text-xs text-gray-400 mt-1">Fetched {fetched}</p>
        )}
      </button>

      {/* ── Expanded panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-5">

          {/* Override banner */}
          {isOverridden && overrideReason && (
            <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-xs">
              <p className="font-medium text-amber-700">Score overridden by analyst</p>
              <p className="text-amber-600 mt-0.5">{overrideReason}</p>
            </div>
          )}

          {/* Score explanation */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              How this score was calculated
            </p>
            <ul className="space-y-1.5">
              {steps.map((step, i) => (
                <li key={i} className={`text-sm flex items-start gap-2 ${stepTextColor(step.type)}`}>
                  <StepIcon type={step.type} />
                  <span>{step.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* TRUST_CERTS: portal breakdown table */}
          {scrapeMeta && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Portal check results
              </p>
              <div className="divide-y divide-gray-50 rounded-md border border-gray-100 overflow-hidden">
                {Object.entries(scrapeMeta).map(([portal, meta]) => {
                  const found   = meta.found
                  const checked = meta.attempted
                  return (
                    <div key={portal} className="flex items-start justify-between px-3 py-2 text-xs bg-white">
                      <span className="text-gray-700 font-medium">
                        {PORTAL_LABELS[portal] ?? portal}
                      </span>
                      <span className={`ml-4 text-right ${
                        !checked   ? 'text-gray-400' :
                        found      ? 'text-green-700 font-medium' :
                        meta.error ? 'text-amber-700' :
                                     'text-gray-400'
                      }`}>
                        {!checked
                          ? 'Not checked'
                          : found
                          ? `Found${meta.keywords_found?.length ? ` — ${meta.keywords_found.slice(0, 2).join(', ')}` : ''}`
                          : meta.error
                          ? `Not found — ${meta.error}`
                          : `Not found${meta.http_status ? ` (HTTP ${meta.http_status})` : ''}`
                        }
                      </span>
                    </div>
                  )
                })}
              </div>
              {(sd.status as string) === 'inconclusive' && (
                <p className="text-xs text-amber-700 font-medium mt-2">
                  All automated checks were inconclusive — manual verification recommended.
                </p>
              )}
            </div>
          )}

          {/* SANCTIONS: screened names + match cards */}
          {dimension === 'SANCTIONS' && (
            <div className="space-y-3">
              {sanctionsScreened.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Names screened
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sanctionsScreened.map((name, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sanctionsMatches.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Matches found
                  </p>
                  <div className="space-y-2">
                    {sanctionsMatches.map((m, i) => (
                      <div key={i} className={`rounded-md px-3 py-2.5 text-xs border ${
                        m.level === 'confirmed'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <p className={`font-semibold ${m.level === 'confirmed' ? 'text-red-800' : 'text-amber-800'}`}>
                          {m.level === 'confirmed' ? 'Confirmed match' : 'Possible match'} · {m.source}
                        </p>
                        <p className={`mt-0.5 ${m.level === 'confirmed' ? 'text-red-700' : 'text-amber-700'}`}>
                          &ldquo;{m.name}&rdquo; matched against &ldquo;{m.matchedAgainst}&rdquo; ({m.similarity}% similarity)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Data source footer */}
          <div className="pt-1 border-t border-gray-50">
            <p className="text-xs text-gray-400">
              Source: <span className="text-gray-500">{source}</span>
              {fetched && <> · Fetched {fetched}</>}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
