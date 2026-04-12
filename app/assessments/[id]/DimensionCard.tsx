'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FATF_GREY_LIST, FATF_BLACK_LIST } from '@/src/lib/fatf'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  dimension: string
  label: string
  weight: number
  finalScore: number
  rawScore: number
  isOverridden: boolean
  overrideReason: string | null
  overriddenAt: Date | string | null
  sourceData: Record<string, unknown> | null
  fetchedAt: Date | string | null
  scoreId: string
  assessmentId: string
  canOverride: boolean
}

type StepType = 'base' | 'deduction' | 'positive' | 'info' | 'warning'
interface Step { text: string; type: StepType; action?: string }

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

// ── Error categorisation ──────────────────────────────────────────────────────

type ErrorCategory = 'timeout' | 'auth' | 'not_found' | 'rate_limit' | 'server' | 'other'

function categorizeError(err: unknown): ErrorCategory {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('timed out')) return 'timeout'
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) return 'auth'
  if (msg.includes('404') || msg.includes('not found')) return 'not_found'
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) return 'rate_limit'
  if (msg.includes('5') && /→ 5\d\d/.test(msg)) return 'server'
  return 'other'
}

const ERROR_LABELS: Record<ErrorCategory, string> = {
  timeout: 'The request timed out before data could be retrieved.',
  auth: 'Access was denied — the API key may have expired or lacked permissions.',
  not_found: 'No record was found for this company.',
  rate_limit: 'The data source temporarily blocked the request due to usage limits.',
  server: 'The data source returned a server error.',
  other: 'Data could not be retrieved due to an unexpected error.',
}

// ── Portal status helper ──────────────────────────────────────────────────────

function friendlyPortalStatus(meta: {
  attempted: boolean
  http_status?: number
  found: boolean
  keywords_found?: string[]
  error?: string | null
}): { text: string; color: string } {
  if (!meta.attempted) return { text: 'Not checked', color: 'text-gray-400' }
  if (meta.found) {
    const kw = meta.keywords_found?.slice(0, 2).join(', ')
    return {
      text: kw ? `Found — ${kw}` : 'Found',
      color: 'text-green-700 font-medium',
    }
  }

  // Not found — determine friendly reason
  const status = meta.http_status ?? 0
  const errMsg = (meta.error ?? '').toLowerCase()

  if (errMsg.includes('abort') || errMsg.includes('timeout')) {
    return { text: 'Could not be reached in time', color: 'text-amber-700' }
  }
  if (status === 403 || status === 429 || errMsg.includes('forbidden') || errMsg.includes('blocked')) {
    return { text: 'Access blocked by portal security', color: 'text-amber-700' }
  }
  if (status === 404 || status === 0) {
    return { text: 'Not listed on this platform', color: 'text-gray-500' }
  }
  if (status >= 500) {
    return { text: 'Platform temporarily unavailable', color: 'text-amber-700' }
  }
  return { text: 'Not listed on this platform', color: 'text-gray-500' }
}

// ── Explanation builders ──────────────────────────────────────────────────────

function explainFinancialHealth(sd: Record<string, unknown>, score: number): Step[] {
  const steps: Step[] = [{ text: 'Started at 100.', type: 'base' }]

  // Was data successfully fetched?
  if (sd.error) {
    const cat = categorizeError(sd.error)
    const reason = ERROR_LABELS[cat]
    steps.push({
      text: `Companies House data could not be retrieved. ${reason} This does not reflect on the vendor — the score below is based only on the data that was available.`,
      type: 'warning',
      action: 'Visit find-and-update.company-information.service.gov.uk to check filing status manually.',
    })
  }

  const status = sd.company_status as string | undefined
  // Only show the status deduction if data was actually fetched (not the 'unknown' fallback from no CH number)
  if (status && status !== 'active' && status !== 'unknown') {
    steps.push({ text: `Company status is "${status}" (not active): −60`, type: 'deduction' })
  } else if (status === 'unknown' && !sd.error) {
    steps.push({ text: 'No Companies House number was provided — company status could not be checked.', type: 'info' })
  } else if (status === 'active') {
    steps.push({ text: 'Company status: active.', type: 'positive' })
  }

  const acc = sd.accounts as { overdue?: boolean; next_due?: string } | undefined
  if (acc?.overdue) {
    steps.push({ text: 'Annual accounts are overdue: −40', type: 'deduction' })
  } else if (acc?.next_due) {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 18)
    if (new Date(acc.next_due) < cutoff) {
      steps.push({ text: `No accounts filed in the last 18 months (next due: ${acc.next_due}): −30`, type: 'deduction' })
    } else {
      steps.push({ text: `Annual accounts next due: ${acc.next_due}. Up to date.`, type: 'positive' })
    }
  } else if (!sd.error) {
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
      steps.push({ text: `Going concern warning detected in accounts (AI confidence: ${gc.confidence}): −30`, type: 'deduction' })
      if (gc.summary) steps.push({ text: `AI note: "${gc.summary}"`, type: 'warning' })
    } else {
      steps.push({ text: 'No going concern warning found in the latest filing text.', type: 'positive' })
    }
  } else if (gc?.status === 'not_checked') {
    steps.push({
      text: 'The most recent filing is in PDF format and could not be read as text, so a going concern check was not performed.',
      type: 'info',
      action: 'Download and review the accounts on Companies House to check for auditor going concern notes.',
    })
  } else if (gc?.status === 'summary_unavailable') {
    steps.push({
      text: 'AI going concern analysis was temporarily unavailable and was skipped. No deduction was applied.',
      type: 'info',
      action: 'Review the auditor\'s report in the latest accounts directly on Companies House.',
    })
  }

  steps.push({ text: `Final score: ${score}`, type: 'base' })
  return steps
}

function explainBreachHistory(sd: Record<string, unknown>, score: number): Step[] {
  // When HIBP is disabled the scoring sets enabled: false explicitly in sourceData
  if (sd.enabled === false) {
    return [
      {
        text: 'Breach history checking via Have I Been Pwned is not configured for this deployment. A neutral score of 75 was applied.',
        type: 'info',
        action: 'Ask your administrator to enable HIBP integration, or check the vendor domain manually at haveibeenpwned.com.',
      },
    ]
  }

  if (sd.error) {
    const cat = categorizeError(sd.error)
    const reason = ERROR_LABELS[cat]
    let action: string | undefined
    if (cat === 'timeout') action = 'This is usually transient. Re-run the assessment or check the domain manually at haveibeenpwned.com.'
    else if (cat === 'auth') action = 'Ask your administrator to verify the HIBP API key in environment settings.'
    else if (cat === 'rate_limit') action = 'Re-run the assessment after a short wait, or check haveibeenpwned.com manually.'
    else action = 'Check the vendor domain manually at haveibeenpwned.com.'

    return [
      {
        text: `Breach data could not be retrieved. ${reason} A neutral score of 75 was applied — this does not indicate the vendor is clean.`,
        type: 'warning',
        action,
      },
    ]
  }

  const steps: Step[] = [{ text: 'Started at 100.', type: 'base' }]
  const breaches = (sd.breaches as Array<{ Name: string; BreachDate: string; DataClasses?: string[] }>) ?? []
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24)

  if (breaches.length === 0) {
    steps.push({ text: 'No breaches found on the vendor\'s domain.', type: 'positive' })
  } else {
    for (const b of breaches) {
      const recent = new Date(b.BreachDate) >= cutoff
      const classes = b.DataClasses?.slice(0, 3).join(', ')
      steps.push({
        text: `"${b.Name}" (${b.BreachDate})${classes ? ` — data types: ${classes}` : ''}: ${recent ? '−25 (within 24 months)' : '−10 (older than 24 months)'}`,
        type: 'deduction',
      })
    }
  }

  steps.push({ text: `Final score: ${score}`, type: 'base' })
  return steps
}

function explainSanctions(sd: Record<string, unknown>): Step[] {
  const steps: Step[] = []

  if (sd.error) {
    const cat = categorizeError(sd.error)
    let action: string
    if (cat === 'timeout' || cat === 'server') {
      action = 'Re-run the assessment to retry, or perform a manual check on the OFSI, OFAC, and EU financial sanctions lists.'
    } else {
      action = 'Perform a manual sanctions check on the OFSI, OFAC, and EU financial sanctions lists before proceeding.'
    }
    return [
      {
        text: 'The sanctions database could not be queried. A score of 100 was applied but this result is unreliable.',
        type: 'warning',
        action,
      },
      {
        text: 'You must complete a manual sanctions check before proceeding with this vendor.',
        type: 'warning',
      },
    ]
  }

  const screened = (sd.screened as string[]) ?? []
  const matches = (sd.matches as Array<{
    name: string; matchedAgainst: string; similarity: number; level: string; source: string
  }>) ?? []

  steps.push({
    text: `Screened ${screened.length} name${screened.length !== 1 ? 's' : ''} against OFSI, OFAC, and EU financial sanctions lists.`,
    type: 'info',
  })

  if (matches.length === 0) {
    steps.push({ text: 'No matches found across all lists. Score: 100.', type: 'positive' })
  } else {
    const confirmed = matches.filter(m => m.level === 'confirmed')
    const possible  = matches.filter(m => m.level === 'possible')

    if (confirmed.length) {
      steps.push({
        text: `${confirmed.length} confirmed sanctions match${confirmed.length !== 1 ? 'es' : ''}. Score forced to 0.`,
        type: 'deduction',
        action: 'This requires immediate escalation to your compliance team. Do not proceed with this vendor without authorisation.',
      })
    }
    if (possible.length) {
      steps.push({
        text: `${possible.length} possible sanctions match${possible.length !== 1 ? 'es' : ''} (high name similarity but below confirmation threshold). Score set to 40.`,
        type: 'warning',
        action: 'Review the matched entries below and verify whether they relate to this vendor. Common names may produce false positives.',
      })
    }
  }

  return steps
}

function explainOwnership(sd: Record<string, unknown>, score: number): Step[] {
  const steps: Step[] = []
  const lei          = sd.lei as string | undefined
  const legalName    = sd.legalName as string | undefined
  const jurisdiction = sd.jurisdiction as string | undefined
  const status       = sd.status as string | undefined
  const parent       = sd.ultimateParent as { lei?: string; name?: string } | undefined

  if (sd.error) {
    const cat = categorizeError(sd.error)
    let action: string
    if (cat === 'timeout') {
      action = 'This is usually transient. Re-run the assessment or search at gleif.org manually.'
    } else if (cat === 'not_found') {
      action = 'Many legitimate companies — especially smaller UK firms — are not GLEIF-registered. This does not indicate a problem. Verify jurisdiction manually if needed.'
    } else {
      action = 'Search at gleif.org to check LEI registration and jurisdiction manually.'
    }
    steps.push({
      text: `GLEIF data could not be retrieved. ${ERROR_LABELS[cat]} The ownership score is based on available information only.`,
      type: 'warning',
      action,
    })
  }

  if (!lei) {
    if (!sd.error) {
      steps.push({
        text: 'No GLEIF record was found for this company.',
        type: 'info',
        action: 'Many smaller companies are not GLEIF-registered — this does not indicate a problem. If jurisdiction is important, verify it from the Companies House record.',
      })
    }
  } else {
    steps.push({ text: `GLEIF record found. LEI: ${lei}`, type: 'positive' })
    if (legalName) steps.push({ text: `Legal name on record: ${legalName}`, type: 'info' })
    if (status)    steps.push({ text: `Entity status: ${status}`, type: status === 'ACTIVE' ? 'positive' : 'warning' })
  }

  if (jurisdiction) {
    const jUp = jurisdiction.toUpperCase()
    const jLo = jurisdiction.toLowerCase()
    if (HIGH_JURISDICTIONS.has(jUp)) {
      steps.push({ text: `Jurisdiction "${jurisdiction}" is a high-trust jurisdiction (UK / US / EU / equivalent): score 95.`, type: 'positive' })
    } else if (FATF_BLACK_LIST.some(c => jLo.includes(c.toLowerCase()))) {
      steps.push({
        text: `Jurisdiction "${jurisdiction}" is on the FATF black list: score 10.`,
        type: 'deduction',
        action: 'Do not proceed without escalating to your compliance team. This jurisdiction is subject to FATF countermeasures.',
      })
    } else if (FATF_GREY_LIST.some(c => jLo.includes(c.toLowerCase()))) {
      steps.push({
        text: `Jurisdiction "${jurisdiction}" is on the FATF grey list (enhanced monitoring): score 40.`,
        type: 'warning',
        action: 'Apply enhanced due diligence. Request beneficial ownership documentation and consider senior management approval.',
      })
    } else {
      steps.push({ text: `Jurisdiction "${jurisdiction}" is a FATF member in good standing: score 65.`, type: 'info' })
    }
  } else {
    steps.push({
      text: 'Jurisdiction could not be determined — defaulting to score 40.',
      type: 'info',
      action: 'Check the registered address on Companies House to determine the operating jurisdiction.',
    })
  }

  if (parent?.name) steps.push({ text: `Ultimate parent: ${parent.name}${parent.lei ? ` (LEI: ${parent.lei})` : ''}`, type: 'info' })
  steps.push({ text: `Final score: ${score}`, type: 'base' })
  return steps
}

function explainTrustCerts(sd: Record<string, unknown>, score: number): Step[] {
  const certs  = (sd.certs_found as Array<{ certType: string; source: string; expiryDate?: string }>) ?? []
  const status = sd.status as string | undefined
  const steps: Step[] = []

  if (sd.error) {
    steps.push({
      text: 'An error occurred during portal checks. Results below may be incomplete.',
      type: 'warning',
    })
  }

  if (certs.length === 0) {
    if (status === 'inconclusive') {
      steps.push({
        text: 'No certifications were detected after checking all automated sources, but some sources were unreachable. Base score: 25.',
        type: 'warning',
        action: 'Request copies of SOC 2, ISO 27001, or Cyber Essentials certificates directly from the vendor.',
      })
    } else {
      steps.push({
        text: 'No certifications were found across any of the automated sources checked. Base score: 15.',
        type: 'info',
        action: 'This may mean the vendor does not publish certifications publicly. Request SOC 2, ISO 27001, or Cyber Essentials documentation directly from the vendor.',
      })
    }
  } else {
    steps.push({
      text: `${certs.length} certification${certs.length !== 1 ? 's' : ''} found. Score accumulates per certification.`,
      type: 'base',
    })
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

  return steps
}

function explainNewsSentiment(sd: Record<string, unknown>): Step[] {
  const status      = sd.status as string | undefined
  const sentiment   = sd.sentiment as string | undefined
  const summary     = sd.summary as string | undefined
  const items       = (sd.risk_items as Array<{ headline: string; risk_type: string }>) ?? []
  const articlesCount = sd.articles_count as number | undefined
  const queryNote   = sd.query_note as string | undefined
  const steps: Step[] = []

  if (status === 'not_checked') {
    steps.push({
      text: `No risk-relevant headlines identified. A neutral-positive score has been applied.${articlesCount != null && articlesCount > 0 ? ` (${articlesCount} articles retrieved)` : ''}`,
      type: 'info',
      action: 'Search Google News or industry trade press manually for recent coverage of this vendor.',
    })
    if (queryNote) steps.push({ text: queryNote, type: 'info' })
    return steps
  }

  if (status === 'summary_unavailable') {
    const count = articlesCount ?? 0
    steps.push({
      text: `${count > 0 ? `${count} headline${count !== 1 ? 's' : ''} were retrieved` : 'Headlines were retrieved'} but AI sentiment analysis was temporarily unavailable. A neutral-positive score of 80 was applied.`,
      type: 'info',
      action: 'Review the news headlines manually and re-run the assessment if you need an AI sentiment score.',
    })
    if (queryNote) steps.push({ text: queryNote, type: 'info' })
    return steps
  }

  const sentimentScores: Record<string, number> = { positive: 90, neutral: 80, mixed: 50, negative: 20 }
  if (sentiment) {
    const t: StepType = sentiment === 'negative' ? 'deduction' : sentiment === 'positive' ? 'positive' : 'info'
    const count = articlesCount != null ? ` (${articlesCount} article${articlesCount !== 1 ? 's' : ''} analysed)` : ''
    steps.push({
      text: `AI assessed overall news sentiment as "${sentiment}"${count}: score ${sentimentScores[sentiment] ?? 70}.`,
      type: t,
    })
  }

  if (queryNote) steps.push({ text: queryNote, type: 'info' })
  if (summary) steps.push({ text: `AI summary: "${summary}"`, type: 'info' })

  if (items.length === 0) {
    steps.push({ text: 'No specific risk items identified in the headlines.', type: 'positive' })
  } else {
    steps.push({
      text: `${items.length} risk item${items.length !== 1 ? 's' : ''} identified:`,
      type: 'warning',
    })
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
  dimension, label, weight, finalScore, rawScore, isOverridden, overrideReason, overriddenAt,
  sourceData, fetchedAt, scoreId, assessmentId, canOverride,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [newScoreVal, setNewScoreVal] = useState(String(finalScore))
  const [overrideReason2, setOverrideReason2] = useState('')
  const [saving, setSaving] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  async function handleOverrideSave() {
    const ns = Number(newScoreVal)
    if (!Number.isInteger(ns) || ns < 0 || ns > 100) {
      setOverrideError('Score must be a whole number between 0 and 100.')
      return
    }
    if (overrideReason2.trim().length < 10) {
      setOverrideError('Reason must be at least 10 characters.')
      return
    }
    setOverrideError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/scores/${dimension}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newScore: ns, reason: overrideReason2.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setOverrideError((data as { error?: string }).error ?? 'Failed to save override.')
        return
      }
      setOverrideOpen(false)
      setOverrideReason2('')
      router.refresh()
    } catch {
      setOverrideError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }
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
          <div className="flex items-center gap-2">
            {canOverride && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setOverrideOpen(o => !o); setOverrideError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setOverrideOpen(o => !o); setOverrideError(null) } }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
              >
                Adjust score
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mt-3">
          <span className={`text-3xl font-bold ${scoreColor(finalScore)}`}>{finalScore}</span>
          <span className="text-sm text-gray-400">/100</span>
          {isOverridden && (
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
              Manually adjusted
            </span>
          )}
        </div>

        {fetched && (
          <p className="text-xs text-gray-400 mt-1">Fetched {fetched}</p>
        )}
      </button>

      {/* ── Override form ──────────────────────────────────────────────────── */}
      {overrideOpen && (
        <div className="border-t border-indigo-100 bg-indigo-50 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Adjust score</p>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-700 w-32 flex-shrink-0">New score (0–100)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={newScoreVal}
              onChange={(e) => setNewScoreVal(e.target.value)}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <span className="text-xs text-gray-400">Current: {finalScore}</span>
          </div>
          <div>
            <label className="text-xs text-gray-700 block mb-1">Reason (required, min 10 characters)</label>
            <textarea
              rows={2}
              value={overrideReason2}
              onChange={(e) => setOverrideReason2(e.target.value)}
              placeholder="Explain why you are adjusting this score…"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
            />
          </div>
          {overrideError && (
            <p className="text-xs text-red-600">{overrideError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleOverrideSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setOverrideOpen(false); setOverrideError(null); setOverrideReason2('') }}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Expanded panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-5">

          {/* Override banner */}
          {isOverridden && (
            <div className="rounded-md bg-purple-50 border border-purple-100 px-3 py-2 text-xs space-y-0.5">
              <p className="font-medium text-purple-700">Manually adjusted</p>
              <p className="text-purple-600">Original system score: {rawScore}</p>
              {overrideReason && <p className="text-purple-600">{overrideReason}</p>}
              {overriddenAt && (
                <p className="text-purple-400">
                  {new Date(overriddenAt).toLocaleString('en-GB')}
                </p>
              )}
            </div>
          )}

          {/* Score explanation */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              How this score was calculated
            </p>
            <ul className="space-y-2">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <StepIcon type={step.type} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${stepTextColor(step.type)}`}>{step.text}</span>
                    {step.action && (
                      <p className="mt-1 text-xs leading-relaxed">
                        <span className="font-medium text-indigo-400">Suggested action:</span>{' '}
                        <span className="text-gray-600">{step.action}</span>
                      </p>
                    )}
                  </div>
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
                  const { text, color } = friendlyPortalStatus(meta)
                  return (
                    <div key={portal} className="flex items-start justify-between px-3 py-2 text-xs bg-white">
                      <span className="text-gray-700 font-medium">
                        {PORTAL_LABELS[portal] ?? portal}
                      </span>
                      <span className={`ml-4 text-right ${color}`}>
                        {text}
                      </span>
                    </div>
                  )
                })}
              </div>
              {(sd.status as string) === 'inconclusive' && (
                <p className="text-xs text-amber-700 font-medium mt-2">
                  All automated checks were inconclusive — request certification documents directly from the vendor.
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
                        {m.level === 'possible' && (
                          <p className="mt-1 text-amber-600 italic">
                            Possible matches may be coincidental, especially for common names. Verify before escalating.
                          </p>
                        )}
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
