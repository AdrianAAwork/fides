'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FATF_GREY_LIST, FATF_BLACK_LIST } from '@/src/lib/fatf'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CertRow {
  id: string
  certType: string
  issuingBody: string | null
  auditPeriodStart: string | null
  auditPeriodEnd: string | null
  expiryDate: string | null
  sourceUrl: string | null
  notes: string | null
}

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
  certifications?: CertRow[]
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

function scoreTextColor(s: number): string {
  if (s >= 80) return 'text-[#3B6D11]'
  if (s >= 50) return 'text-[#BA7517]'
  return 'text-[#A32D2D]'
}

function scoreBarColor(s: number): string {
  if (s >= 80) return 'bg-[#3B6D11]'
  if (s >= 50) return 'bg-[#BA7517]'
  return 'bg-[#A32D2D]'
}

// Keep for internal explanation steps
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
  if (type === 'deduction') return <span className="text-[#A32D2D] font-bold leading-none mt-0.5 flex-shrink-0">↓</span>
  if (type === 'positive')  return <span className="text-[#3B6D11] font-bold leading-none mt-0.5 flex-shrink-0">✓</span>
  if (type === 'warning')   return <span className="text-[#BA7517] font-bold leading-none mt-0.5 flex-shrink-0">!</span>
  if (type === 'base')      return <span className="text-[#B8B3CE] leading-none mt-0.5 flex-shrink-0">—</span>
  return <span className="text-[#B8B3CE] leading-none mt-0.5 flex-shrink-0">·</span>
}

function stepTextColor(type: StepType): string {
  if (type === 'deduction') return 'text-[#791F1F]'
  if (type === 'positive')  return 'text-[#27500A]'
  if (type === 'warning')   return 'text-[#633806]'
  if (type === 'base')      return 'text-[#1A1625] font-medium'
  return 'text-[#5B5478]'
}

// ── Main component ────────────────────────────────────────────────────────────

const CERT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'SOC2_TYPE_II', label: 'SOC 2 Type II' },
  { value: 'SOC2_TYPE_I', label: 'SOC 2 Type I' },
  { value: 'ISO_27001', label: 'ISO 27001' },
  { value: 'ISO_22301', label: 'ISO 22301' },
  { value: 'ISO_27701', label: 'ISO 27701' },
  { value: 'CYBER_ESSENTIALS', label: 'Cyber Essentials' },
  { value: 'CYBER_ESSENTIALS_PLUS', label: 'Cyber Essentials Plus' },
  { value: 'PCI_DSS', label: 'PCI DSS' },
  { value: 'CSA_STAR', label: 'CSA STAR' },
  { value: 'OTHER', label: 'Other certification' },
]

interface CertForm {
  certType: string
  issuingBody: string
  auditPeriodStart: string
  auditPeriodEnd: string
  expiryDate: string
  sourceUrl: string
  notes: string
}

const EMPTY_CERT_FORM: CertForm = {
  certType: 'SOC2_TYPE_II',
  issuingBody: '',
  auditPeriodStart: '',
  auditPeriodEnd: '',
  expiryDate: '',
  sourceUrl: '',
  notes: '',
}

export default function DimensionCard({
  dimension, label, weight, finalScore, rawScore, isOverridden, overrideReason, overriddenAt,
  sourceData, fetchedAt, scoreId, assessmentId, canOverride, certifications = [],
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [newScoreVal, setNewScoreVal] = useState(String(finalScore))
  const [overrideReason2, setOverrideReason2] = useState('')
  const [saving, setSaving] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [certFormOpen, setCertFormOpen] = useState(false)
  const [certForm, setCertForm] = useState<CertForm>(EMPTY_CERT_FORM)
  const [certSaving, setCertSaving] = useState(false)
  const [certError, setCertError] = useState<string | null>(null)
  const [certDeleteId, setCertDeleteId] = useState<string | null>(null)
  const [certDeleting, setCertDeleting] = useState(false)

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
  async function handleCertSave() {
    setCertError(null)
    setCertSaving(true)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/certifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certType: certForm.certType,
          issuingBody: certForm.issuingBody || null,
          auditPeriodStart: certForm.auditPeriodStart || null,
          auditPeriodEnd: certForm.auditPeriodEnd || null,
          expiryDate: certForm.expiryDate || null,
          sourceUrl: certForm.sourceUrl || null,
          notes: certForm.notes || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCertError((data as { error?: string }).error ?? 'Failed to save.')
        return
      }
      setCertFormOpen(false)
      setCertForm(EMPTY_CERT_FORM)
      router.refresh()
    } catch {
      setCertError('Network error. Please try again.')
    } finally {
      setCertSaving(false)
    }
  }

  async function handleCertDelete(certId: string) {
    setCertDeleting(true)
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/certifications/${certId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCertError((data as { error?: string }).error ?? 'Failed to remove.')
        return
      }
      setCertDeleteId(null)
      router.refresh()
    } catch {
      setCertError('Network error. Please try again.')
    } finally {
      setCertDeleting(false)
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
    <div className="bg-white rounded-xl border border-[#E2DFF0] overflow-hidden">
      {/* ── Collapsed header ───────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 pt-4 pb-3 text-left hover:bg-[#F9F8FD] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-[#1A1625]">{label}</span>
            <span className="text-[11px] text-[#8B85A8] bg-[#F9F8FD] border border-[#E2DFF0] px-1.5 py-0.5 rounded-full">
              {weight}%
            </span>
            {isOverridden && (
              <span className="text-[11px] bg-[#EEEDFE] text-[#5B3FD4] px-2 py-0.5 rounded-full">
                Manually adjusted
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[14px] font-medium ${scoreTextColor(finalScore)}`}>
              {finalScore}<span className="text-[#B8B3CE] font-normal text-[12px]">/100</span>
            </span>
            <svg
              className={`w-4 h-4 text-[#B8B3CE] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2.5 h-[3px] w-full bg-[#F9F8FD] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${scoreBarColor(finalScore)}`}
            style={{ width: `${finalScore}%` }}
          />
        </div>
      </button>

      {/* ── Expanded panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-[#E2DFF0] px-5 py-5 space-y-5">

          {/* Adjust score button: only visible in expanded panel */}
          {open && canOverride && !overrideOpen && (
            <div className="flex justify-end">
              <button
                onClick={() => { setOverrideOpen(true); setOverrideError(null) }}
                className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
              >
                Adjust score
              </button>
            </div>
          )}

          {/* Override form */}
          {overrideOpen && (
            <div className="rounded-xl bg-[#F9F8FD] border border-[#E2DFF0] px-4 py-4 space-y-3">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[#5B3FD4] font-medium">Adjust score</p>
              <div className="flex items-center gap-3">
                <label className="text-[12px] text-[#5B5478] w-36 flex-shrink-0">New score (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newScoreVal}
                  onChange={(e) => setNewScoreVal(e.target.value)}
                  className="w-24 rounded-lg border border-[#E2DFF0] px-2 py-1 text-[14px] text-[#1A1625] focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                />
                <span className="text-[12px] text-[#B8B3CE]">Current: {finalScore}</span>
              </div>
              <div>
                <label className="text-[12px] text-[#5B5478] block mb-1">Reason (required, min 10 characters)</label>
                <textarea
                  rows={2}
                  value={overrideReason2}
                  onChange={(e) => setOverrideReason2(e.target.value)}
                  placeholder="Explain why you are adjusting this score…"
                  className="w-full rounded-lg border border-[#E2DFF0] px-2 py-1.5 text-[14px] text-[#1A1625] focus:outline-none focus:ring-1 focus:ring-[#5B3FD4] resize-none bg-white"
                />
              </div>
              {overrideError && <p className="text-[12px] text-[#791F1F]">{overrideError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleOverrideSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-[13px] font-medium bg-[#5B3FD4] text-white rounded-lg hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setOverrideOpen(false); setOverrideError(null); setOverrideReason2('') }}
                  className="px-3 py-1.5 text-[13px] font-medium text-[#5B3FD4] bg-white border border-[#E2DFF0] rounded-lg hover:bg-[#F9F8FD] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Override banner */}
          {isOverridden && (
            <div className="rounded-xl bg-[#EEEDFE] border border-[#E2DFF0] px-3 py-2.5 space-y-0.5">
              <p className="text-[12px] font-medium text-[#5B3FD4]">Manually adjusted</p>
              <p className="text-[12px] text-[#5B3FD4]">Original system score: {rawScore}</p>
              {overrideReason && <p className="text-[12px] text-[#5B5478]">{overrideReason}</p>}
              {overriddenAt && (
                <p className="text-[11px] text-[#B8B3CE]">
                  {new Date(overriddenAt).toLocaleString('en-GB')}
                </p>
              )}
            </div>
          )}

          {/* Score explanation */}
          <div>
            <p className="text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em] mb-3">
              How this score was calculated
            </p>
            <ul className="space-y-2">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <StepIcon type={step.type} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-[13px] leading-relaxed ${stepTextColor(step.type)}`}>{step.text}</span>
                    {step.action && (
                      <p className="mt-1 text-[12px] leading-relaxed">
                        <span className="font-medium text-[#5B3FD4]">Suggested action:</span>{' '}
                        <span className="text-[#5B5478]">{step.action}</span>
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
              <p className="text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em] mb-2">
                Portal check results
              </p>
              <div className="divide-y divide-[#E2DFF0] rounded-xl border border-[#E2DFF0] overflow-hidden">
                {Object.entries(scrapeMeta).map(([portal, meta]) => {
                  const { text, color } = friendlyPortalStatus(meta)
                  return (
                    <div key={portal} className="flex items-start justify-between px-3 py-2 text-xs bg-white">
                      <span className="text-[#5B5478] font-medium">
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
                <p className="text-[12px] text-[#633806] font-medium mt-2">
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
                  <p className="text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em] mb-1.5">
                    Names screened
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sanctionsScreened.map((name, i) => (
                      <span key={i} className="text-[12px] bg-[#F9F8FD] text-[#5B5478] border border-[#E2DFF0] px-2 py-0.5 rounded-full">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sanctionsMatches.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em] mb-1.5">
                    Matches found
                  </p>
                  <div className="space-y-2">
                    {sanctionsMatches.map((m, i) => (
                      <div key={i} className={`rounded-xl px-3 py-2.5 text-xs border ${
                        m.level === 'confirmed'
                          ? 'bg-[#FCEBEB] border-[#FCEBEB]'
                          : 'bg-[#FAEEDA] border-[#FAEEDA]'
                      }`}>
                        <p className={`font-semibold ${m.level === 'confirmed' ? 'text-[#791F1F]' : 'text-[#633806]'}`}>
                          {m.level === 'confirmed' ? 'Confirmed match' : 'Possible match'} · {m.source}
                        </p>
                        <p className={`mt-0.5 ${m.level === 'confirmed' ? 'text-[#791F1F]' : 'text-[#633806]'}`}>
                          &ldquo;{m.name}&rdquo; matched against &ldquo;{m.matchedAgainst}&rdquo; ({m.similarity}% similarity)
                        </p>
                        {m.level === 'possible' && (
                          <p className="mt-1 text-[#633806] italic">
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

          {/* Manual certifications (TRUST_CERTS only) */}
          {dimension === 'TRUST_CERTS' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-medium text-[#8B85A8] uppercase tracking-[0.06em]">
                  Manual certifications
                </p>
                {canOverride && !certFormOpen && (
                  <button
                    onClick={() => { setCertFormOpen(true); setCertError(null) }}
                    className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium"
                  >
                    Add certification
                  </button>
                )}
              </div>

              {/* Cert add form */}
              {certFormOpen && (
                <div className="rounded-xl bg-[#F9F8FD] border border-[#E2DFF0] px-4 py-4 space-y-3 mb-3">
                  <p className="text-[11px] uppercase tracking-[0.06em] text-[#5B3FD4] font-medium">Add certification</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Cert type</label>
                      <select
                        value={certForm.certType}
                        onChange={e => setCertForm(p => ({ ...p, certType: e.target.value }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      >
                        {CERT_TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Issuing body <span className="normal-case text-[#B8B3CE]">(optional)</span></label>
                      <input
                        type="text"
                        placeholder="e.g. AICPA, BSI, IASME"
                        value={certForm.issuingBody}
                        onChange={e => setCertForm(p => ({ ...p, issuingBody: e.target.value }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Expiry date <span className="normal-case text-[#B8B3CE]">(optional)</span></label>
                      <input
                        type="date"
                        value={certForm.expiryDate}
                        onChange={e => setCertForm(p => ({ ...p, expiryDate: e.target.value }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Audit period start <span className="normal-case text-[#B8B3CE]">(optional)</span></label>
                      <input
                        type="date"
                        value={certForm.auditPeriodStart}
                        onChange={e => setCertForm(p => ({ ...p, auditPeriodStart: e.target.value }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Audit period end <span className="normal-case text-[#B8B3CE]">(optional)</span></label>
                      <input
                        type="date"
                        value={certForm.auditPeriodEnd}
                        onChange={e => setCertForm(p => ({ ...p, auditPeriodEnd: e.target.value }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Source URL <span className="normal-case text-[#B8B3CE]">(optional)</span></label>
                      <input
                        type="text"
                        placeholder="https://trust.vendor.com/…"
                        value={certForm.sourceUrl}
                        onChange={e => setCertForm(p => ({ ...p, sourceUrl: e.target.value }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Notes <span className="normal-case text-[#B8B3CE]">(optional)</span></label>
                      <input
                        type="text"
                        placeholder='e.g. "Found on vendor trust portal"'
                        value={certForm.notes}
                        onChange={e => setCertForm(p => ({ ...p, notes: e.target.value.slice(0, 500) }))}
                        className="w-full rounded-lg border border-[#E2DFF0] px-3 py-2 text-[14px] text-[#1A1625] bg-white focus:outline-none focus:ring-1 focus:ring-[#5B3FD4]"
                      />
                    </div>
                  </div>
                  {certError && <p className="text-[12px] text-[#791F1F]">{certError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCertSave}
                      disabled={certSaving}
                      className="px-3 py-1.5 text-[13px] font-medium bg-[#5B3FD4] text-white rounded-lg hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
                    >
                      {certSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setCertFormOpen(false); setCertForm(EMPTY_CERT_FORM); setCertError(null) }}
                      className="px-3 py-1.5 text-[13px] font-medium text-[#5B3FD4] bg-white border border-[#E2DFF0] rounded-lg hover:bg-[#F9F8FD] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Cert rows */}
              {certifications.length > 0 ? (
                <div className="divide-y divide-[#E2DFF0] rounded-xl border border-[#E2DFF0] overflow-hidden">
                  {certifications.map(cert => {
                    const isExpiringSoon = cert.expiryDate
                      ? (new Date(cert.expiryDate).getTime() - Date.now()) < 90 * 24 * 60 * 60 * 1000
                      : false
                    const isExpired = cert.expiryDate
                      ? new Date(cert.expiryDate) < new Date()
                      : false
                    return (
                      <div key={cert.id} className="px-3 py-3 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center flex-wrap gap-2">
                              <span className="text-[13px] font-medium text-[#1A1625]">
                                {CERT_LABELS[cert.certType] ?? cert.certType}
                              </span>
                              {cert.issuingBody && (
                                <span className="text-[12px] text-[#8B85A8]">· {cert.issuingBody}</span>
                              )}
                            </div>
                            {cert.expiryDate && (
                              <p className={`text-[12px] ${isExpired ? 'text-[#791F1F] font-medium' : isExpiringSoon ? 'text-[#BA7517] font-medium' : 'text-[#5B5478]'}`}>
                                Expires {new Date(cert.expiryDate).toLocaleDateString('en-GB')}
                                {isExpired && ' — expired'}
                                {!isExpired && isExpiringSoon && ' — expiring soon'}
                              </p>
                            )}
                            {cert.sourceUrl && (
                              <a
                                href={cert.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[12px] text-[#5B3FD4] hover:text-[#3C3489] block truncate"
                              >
                                {cert.sourceUrl}
                              </a>
                            )}
                            {cert.notes && (
                              <p className="text-[12px] text-[#8B85A8]">{cert.notes}</p>
                            )}
                          </div>
                          {canOverride && (
                            <div className="flex-shrink-0">
                              {certDeleteId === cert.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] text-[#5B5478]">Remove?</span>
                                  <button
                                    onClick={() => handleCertDelete(cert.id)}
                                    disabled={certDeleting}
                                    className="text-[12px] text-[#791F1F] font-medium hover:text-[#A32D2D] disabled:opacity-50"
                                  >
                                    {certDeleting ? 'Removing…' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setCertDeleteId(null)}
                                    className="text-[12px] text-[#8B85A8] hover:text-[#5B5478]"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setCertDeleteId(cert.id); setCertError(null) }}
                                  className="text-[12px] text-[#B8B3CE] hover:text-[#791F1F] transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : !certFormOpen ? (
                <p className="text-[13px] text-[#B8B3CE]">No manual certifications added yet.</p>
              ) : null}

              {certError && !certFormOpen && (
                <p className="text-[12px] text-[#791F1F] mt-2">{certError}</p>
              )}
            </div>
          )}

          {/* Data source footer */}
          <div className="pt-1 border-t border-[#E2DFF0]">
            <p className="text-[11px] text-[#B8B3CE]">
              Source: <span className="text-[#8B85A8]">{source}</span>
              {fetched && <> · Fetched {fetched}</>}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
