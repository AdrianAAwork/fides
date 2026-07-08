import { FATF_GREY_LIST, FATF_BLACK_LIST } from '@/src/lib/fatf'
import type {
  CompaniesHouseData,
  GleifData,
  SanctionsData,
  HibpData,
  TrustPortalsData,
  GoingConcernResult,
  NewsSentimentResult,
  TrustBand,
  DimensionBand,
  PipelineBands,
} from './types'

const HIGH_SCORING_JURISDICTIONS = new Set([
  'GB', 'US', 'AU', 'CA', 'JP', 'CH', 'NO', 'NZ', 'SG',
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

// ── Band → risk-tier mapping (for backward-compat callers) ────────────────────

function bandToTier(band: TrustBand): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  switch (band) {
    case 'High': return 'LOW'
    case 'Medium': return 'MEDIUM'
    case 'Low': return 'HIGH'
    case 'Needs review': return 'HIGH'
    case 'Not assessed': return 'MEDIUM'
  }
}

// ── Dimension band functions ───────────────────────────────────────────────────

function bandFinancialHealth(ch: CompaniesHouseData, goingConcern: GoingConcernResult): DimensionBand {
  const status = ch.company_status

  let band: TrustBand

  if (!status || status === 'unknown') {
    band = 'Needs review'
  } else if (status !== 'active') {
    band = 'Low'
  } else if (goingConcern.status === 'checked' && goingConcern.going_concern) {
    // Going concern detected — if high confidence → Low; otherwise → Needs review
    band = goingConcern.confidence === 'high' ? 'Low' : 'Needs review'
  } else if (ch.accounts?.overdue || ch.confirmation_statement?.overdue) {
    band = 'Medium'
  } else {
    band = 'High'
  }

  return {
    dimension: 'FINANCIAL_HEALTH',
    suggestedBand: band,
    sourceData: {
      company_status: ch.company_status,
      accounts: ch.accounts,
      confirmation_statement: ch.confirmation_statement,
      going_concern: goingConcern,
      error: ch.error,
    },
    fetchedAt: new Date(),
  }
}

function bandBreachHistory(hibp: HibpData): DimensionBand {
  let band: TrustBand

  if (!hibp.enabled) {
    band = 'Not assessed'
  } else if (hibp.error) {
    band = 'Not assessed'
  } else if (hibp.breaches.length === 0) {
    band = 'High'
  } else {
    // Breaches found — Fides can detect the fact but not judge severity/materiality
    band = 'Needs review'
  }

  return {
    dimension: 'BREACH_HISTORY',
    suggestedBand: band,
    sourceData: { enabled: hibp.enabled, breaches: hibp.breaches, error: hibp.error },
    fetchedAt: new Date(),
  }
}

function bandSanctions(sanctions: SanctionsData): DimensionBand {
  let band: TrustBand

  if (sanctions.error) {
    band = 'Needs review'
  } else {
    switch (sanctions.highestLevel) {
      case 'confirmed': band = 'Low'; break
      case 'possible':  band = 'Needs review'; break
      default:          band = 'High'
    }
  }

  return {
    dimension: 'SANCTIONS',
    suggestedBand: band,
    sourceData: {
      screened: sanctions.screened,
      matches: sanctions.matches,
      highest_level: sanctions.highestLevel,
      error: sanctions.error,
    },
    fetchedAt: new Date(),
  }
}

function bandOwnership(gleif: GleifData): DimensionBand {
  let band: TrustBand
  const jurisdiction = gleif.jurisdiction ?? ''

  if (!gleif.lei) {
    // No GLEIF record — honest absence
    band = gleif.error ? 'Needs review' : 'Not assessed'
  } else if (gleif.matchMethod === 'nameSearch') {
    // Name-search match may be the wrong entity — analyst must confirm
    band = 'Needs review'
  } else if (FATF_BLACK_LIST.some(c => jurisdiction.toLowerCase().includes(c.toLowerCase()))) {
    band = 'Low'
  } else if (FATF_GREY_LIST.some(c => jurisdiction.toLowerCase().includes(c.toLowerCase()))) {
    band = 'Needs review'
  } else if (HIGH_SCORING_JURISDICTIONS.has(jurisdiction.toUpperCase())) {
    band = 'High'
  } else if (!jurisdiction) {
    band = 'Needs review'
  } else {
    band = 'Medium' // FATF member in good standing but not a high-trust jurisdiction
  }

  return {
    dimension: 'OWNERSHIP',
    suggestedBand: band,
    sourceData: {
      lei: gleif.lei,
      legalName: gleif.legalName,
      jurisdiction: gleif.jurisdiction,
      category: gleif.category,
      status: gleif.status,
      ultimateParent: gleif.ultimateParent,
      matchMethod: gleif.matchMethod,
      error: gleif.error,
    },
    fetchedAt: new Date(),
  }
}

function bandTrustCerts(trustPortals: TrustPortalsData): DimensionBand {
  let band: TrustBand

  if (trustPortals.status === 'not_found') {
    band = 'Low'
  } else if (trustPortals.status === 'inconclusive') {
    band = 'Needs review'
  } else {
    // found — band from presence of security certs (no numeric threshold)
    band = trustPortals.certs_found.length > 0 ? 'High' : 'Medium'
  }

  return {
    dimension: 'TRUST_CERTS',
    suggestedBand: band,
    sourceData: {
      certs_found: trustPortals.certs_found,
      status: trustPortals.status,
      scrape_metadata: trustPortals.scrape_metadata,
      error: trustPortals.error,
    },
    fetchedAt: new Date(),
  }
}

function bandNewsSentiment(sentiment: NewsSentimentResult): DimensionBand {
  let band: TrustBand

  if (sentiment.status === 'not_checked' || sentiment.status === 'summary_unavailable') {
    band = 'Not assessed'
  } else {
    switch (sentiment.sentiment) {
      case 'positive':
      case 'neutral':
        band = 'High'; break
      case 'mixed':
        band = 'Medium'; break
      case 'negative':
        band = 'Needs review'; break
      default:
        band = 'Not assessed'
    }
  }

  return {
    dimension: 'NEWS_SENTIMENT',
    suggestedBand: band,
    sourceData: {
      sentiment: sentiment.sentiment,
      risk_items: sentiment.risk_items,
      summary: sentiment.summary,
      status: sentiment.status,
      articles_count: sentiment.articlesCount,
      query_note: sentiment.queryNote,
    },
    fetchedAt: new Date(),
  }
}

// ── Overall band roll-up ──────────────────────────────────────────────────────

function suggestOverallBand(dims: DimensionBand[]): TrustBand {
  const assessed = dims.filter(d => d.suggestedBand !== 'Not assessed')

  if (assessed.length === 0) return 'Not assessed'

  if (assessed.some(d => d.suggestedBand === 'Low'))          return 'Low'
  if (assessed.some(d => d.suggestedBand === 'Needs review')) return 'Needs review'
  if (assessed.every(d => d.suggestedBand === 'High'))        return 'High'
  return 'Medium'
}

// ── Public API ────────────────────────────────────────────────────────────────

export function calculateBands(
  ch: CompaniesHouseData,
  gleif: GleifData,
  sanctions: SanctionsData,
  hibp: HibpData,
  trustPortals: TrustPortalsData,
  goingConcern: GoingConcernResult,
  newsSentiment: NewsSentimentResult
): PipelineBands {
  const financial  = bandFinancialHealth(ch, goingConcern)
  const breach     = bandBreachHistory(hibp)
  const sanctionsBand = bandSanctions(sanctions)
  const ownership  = bandOwnership(gleif)
  const trust      = bandTrustCerts(trustPortals)
  const sentiment  = bandNewsSentiment(newsSentiment)

  const allDims = [financial, breach, sanctionsBand, ownership, trust, sentiment]
  const suggestedOverallBand = suggestOverallBand(allDims)

  return {
    financial_health: financial,
    breach_history: breach,
    sanctions: sanctionsBand,
    ownership,
    trust_certs: trust,
    news_sentiment: sentiment,
    suggestedOverallBand,
    riskTier: bandToTier(suggestedOverallBand),
    overallScore: 0,
  }
}

export function shouldTriggerQuestionnaire(
  ch: CompaniesHouseData,
  sanctions: SanctionsData,
  hibp: HibpData,
  trustPortals: TrustPortalsData,
  financial: DimensionBand,
  newsSentiment: NewsSentimentResult,
  gleif: GleifData,
  goingConcern: GoingConcernResult
): boolean {
  // Always trigger
  if (sanctions.highestLevel === 'confirmed') return true
  if (ch.company_status && ch.company_status !== 'active') return true

  let count = 0

  if (trustPortals.status === 'inconclusive' || trustPortals.certs_found.length === 0) count++

  if (hibp.enabled) {
    const now = new Date()
    const cutoff24m = new Date(now)
    cutoff24m.setMonth(cutoff24m.getMonth() - 24)
    const recentBreach = hibp.breaches.some((b) => new Date(b.BreachDate) >= cutoff24m)
    if (recentBreach) count++
  }

  if (financial.suggestedBand === 'Low') count++
  if (newsSentiment.sentiment === 'negative') count++

  const jurisdiction = gleif.jurisdiction ?? ''
  if (
    FATF_BLACK_LIST.some((c) => jurisdiction.toLowerCase().includes(c.toLowerCase())) ||
    FATF_GREY_LIST.some((c) => jurisdiction.toLowerCase().includes(c.toLowerCase()))
  ) {
    count++
  }

  if (goingConcern.status === 'checked' && goingConcern.going_concern) count++

  return count >= 2
}

// ── Band roll-up from stored DB rows (for recalculate after overrides) ────────

export function rollUpOverallBand(
  rows: Array<{ dimension: string; suggestedBand: string | null; confirmedBand: string | null }>
): TrustBand {
  const VALID: Set<TrustBand> = new Set(['High', 'Medium', 'Low', 'Not assessed', 'Needs review'])

  const effectiveBands: TrustBand[] = rows.map(r => {
    const b = r.confirmedBand ?? r.suggestedBand ?? 'Not assessed'
    return VALID.has(b as TrustBand) ? (b as TrustBand) : 'Not assessed'
  })

  return suggestOverallBand(
    effectiveBands.map(b => ({ dimension: '', suggestedBand: b, sourceData: {}, fetchedAt: new Date() }))
  )
}
