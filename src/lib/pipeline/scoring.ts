import { FATF_GREY_LIST, FATF_BLACK_LIST } from '@/src/lib/fatf'
import type {
  CompaniesHouseData,
  GleifData,
  SanctionsData,
  NewsData,
  HibpData,
  TrustPortalsData,
  GoingConcernResult,
  NewsSentimentResult,
  DimensionScore,
  PipelineScores,
  TrustCertFound,
} from './types'

const HIGH_SCORING_JURISDICTIONS = new Set([
  'GB', 'US', 'AU', 'CA', 'JP', 'CH', 'NO', 'NZ', 'SG',
  // EU member states (ISO-2)
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

function scoreFinancialHealth(ch: CompaniesHouseData, goingConcern: GoingConcernResult): DimensionScore {
  let score = 100

  if (ch.accounts?.overdue) score -= 40
  if (ch.confirmation_statement?.overdue) score -= 20
  if (ch.company_status && ch.company_status !== 'active') score -= 60

  if (!ch.accounts?.overdue && ch.accounts?.next_due) {
    const nextDue = new Date(ch.accounts.next_due)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 18)
    if (nextDue < cutoff) score -= 30
  }

  if (goingConcern.status === 'checked' && goingConcern.going_concern) score -= 30

  const finalScore = Math.max(0, score)

  return {
    dimension: 'FINANCIAL_HEALTH',
    rawScore: finalScore,
    finalScore,
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

function scoreBreachHistory(hibp: HibpData): DimensionScore {
  if (!hibp.enabled) {
    return {
      dimension: 'BREACH_HISTORY',
      rawScore: 75,
      finalScore: 75,
      sourceData: { enabled: false, note: 'HIBP not enabled' },
      fetchedAt: new Date(),
    }
  }

  let score = 100
  const now = new Date()
  const cutoff24m = new Date(now)
  cutoff24m.setMonth(cutoff24m.getMonth() - 24)

  for (const breach of hibp.breaches) {
    const breachDate = new Date(breach.BreachDate)
    if (breachDate >= cutoff24m) {
      score -= 25
    } else {
      score -= 10
    }
  }

  const finalScore = Math.max(0, score)
  return {
    dimension: 'BREACH_HISTORY',
    rawScore: finalScore,
    finalScore,
    sourceData: { breaches: hibp.breaches, error: hibp.error },
    fetchedAt: new Date(),
  }
}

function scoreSanctions(sanctions: SanctionsData): DimensionScore {
  let score: number
  switch (sanctions.highestLevel) {
    case 'confirmed': score = 0; break
    case 'possible': score = 40; break
    default: score = 100
  }

  return {
    dimension: 'SANCTIONS',
    rawScore: score,
    finalScore: score,
    sourceData: {
      screened: sanctions.screened,
      matches: sanctions.matches,
      highest_level: sanctions.highestLevel,
      error: sanctions.error,
    },
    fetchedAt: new Date(),
  }
}

function scoreOwnership(gleif: GleifData): DimensionScore {
  const jurisdiction = gleif.jurisdiction ?? ''

  let score: number
  if (HIGH_SCORING_JURISDICTIONS.has(jurisdiction.toUpperCase())) {
    score = 95
  } else if (FATF_BLACK_LIST.some((c) => jurisdiction.toLowerCase().includes(c.toLowerCase()))) {
    score = 10
  } else if (FATF_GREY_LIST.some((c) => jurisdiction.toLowerCase().includes(c.toLowerCase()))) {
    score = 40
  } else if (!jurisdiction) {
    score = 40
  } else {
    score = 65 // FATF member in good standing
  }

  return {
    dimension: 'OWNERSHIP',
    rawScore: score,
    finalScore: score,
    sourceData: {
      lei: gleif.lei,
      legalName: gleif.legalName,
      jurisdiction: gleif.jurisdiction,
      category: gleif.category,
      status: gleif.status,
      ultimateParent: gleif.ultimateParent,
      error: gleif.error,
    },
    fetchedAt: new Date(),
  }
}

function scoreTrustCerts(trustPortals: TrustPortalsData): DimensionScore {
  const certs = trustPortals.certs_found
  let score = 0

  if (certs.length === 0) {
    score = trustPortals.status === 'inconclusive' ? 25 : 15
  } else {
    for (const cert of certs) {
      const type = cert.certType

      if (type === 'SOC2_TYPE_II') {
        score += 40
      } else if (type === 'ISO_27001') {
        score += 30
      } else if (type === 'CYBER_ESSENTIALS_PLUS') {
        score += 20
      } else if (type === 'CYBER_ESSENTIALS') {
        score += 15
      } else if (type === 'ISO_22301') {
        score += 10
      } else {
        score += 15 // unconfirmed cert
      }
    }
  }

  const finalScore = Math.min(100, score)
  return {
    dimension: 'TRUST_CERTS',
    rawScore: finalScore,
    finalScore,
    sourceData: {
      certs_found: trustPortals.certs_found,
      status: trustPortals.status,
      scrape_metadata: trustPortals.scrape_metadata,
      error: trustPortals.error,
    },
    fetchedAt: new Date(),
  }
}

function scoreNewsSentiment(sentiment: NewsSentimentResult): DimensionScore {
  let score: number
  switch (sentiment.sentiment) {
    case 'positive': score = 90; break
    case 'neutral': score = 70; break
    case 'mixed': score = 50; break
    case 'negative': score = 20; break
    default: score = 70
  }

  if (sentiment.status === 'not_checked' || sentiment.status === 'summary_unavailable') {
    score = 70
  }

  return {
    dimension: 'NEWS_SENTIMENT',
    rawScore: score,
    finalScore: score,
    sourceData: {
      sentiment: sentiment.sentiment,
      risk_items: sentiment.risk_items,
      summary: sentiment.summary,
      status: sentiment.status,
    },
    fetchedAt: new Date(),
  }
}

function weightedScore(scores: Record<string, DimensionScore>): number {
  const weights: Record<string, number> = {
    FINANCIAL_HEALTH: 20,
    BREACH_HISTORY: 25,
    SANCTIONS: 15,
    OWNERSHIP: 10,
    TRUST_CERTS: 20,
    NEWS_SENTIMENT: 10,
  }

  let total = 0
  for (const [dim, weight] of Object.entries(weights)) {
    const s = scores[dim]
    if (s) total += (s.finalScore * weight) / 100
  }
  return Math.round(total)
}

function toTier(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 75) return 'LOW'
  if (score >= 50) return 'MEDIUM'
  if (score >= 25) return 'HIGH'
  return 'CRITICAL'
}

export function calculateScores(
  ch: CompaniesHouseData,
  gleif: GleifData,
  sanctions: SanctionsData,
  news: NewsData,
  hibp: HibpData,
  trustPortals: TrustPortalsData,
  goingConcern: GoingConcernResult,
  newsSentiment: NewsSentimentResult
): PipelineScores {
  const financial = scoreFinancialHealth(ch, goingConcern)
  const breach = scoreBreachHistory(hibp)
  const sanctionsScore = scoreSanctions(sanctions)
  const ownership = scoreOwnership(gleif)
  const trust = scoreTrustCerts(trustPortals)
  const sentimentScore = scoreNewsSentiment(newsSentiment)

  const dimensionMap: Record<string, DimensionScore> = {
    FINANCIAL_HEALTH: financial,
    BREACH_HISTORY: breach,
    SANCTIONS: sanctionsScore,
    OWNERSHIP: ownership,
    TRUST_CERTS: trust,
    NEWS_SENTIMENT: sentimentScore,
  }

  const overall = weightedScore(dimensionMap)
  let tier = toTier(overall)

  // Special override rules
  if (sanctions.highestLevel !== 'none') {
    if (tier === 'LOW' || tier === 'MEDIUM') tier = 'HIGH'
  }
  if (ch.company_status && ch.company_status !== 'active') {
    if (tier === 'LOW' || tier === 'MEDIUM') tier = 'HIGH'
  }
  if (goingConcern.status === 'checked' && goingConcern.going_concern && goingConcern.confidence === 'high') {
    if (tier === 'LOW') tier = 'MEDIUM'
  }

  return {
    financial_health: financial,
    breach_history: breach,
    sanctions: sanctionsScore,
    ownership,
    trust_certs: trust,
    news_sentiment: sentimentScore,
    overallScore: overall,
    riskTier: tier,
  }
}

export function shouldTriggerQuestionnaire(
  ch: CompaniesHouseData,
  sanctions: SanctionsData,
  hibp: HibpData,
  trustPortals: TrustPortalsData,
  financial: DimensionScore,
  newsSentiment: NewsSentimentResult,
  gleif: GleifData,
  goingConcern: GoingConcernResult
): boolean {
  // Always trigger
  if (sanctions.highestLevel === 'confirmed') return true
  if (ch.company_status && ch.company_status !== 'active') return true

  // Count conditional triggers
  let count = 0

  if (trustPortals.status === 'inconclusive' || trustPortals.certs_found.length === 0) count++

  if (hibp.enabled) {
    const now = new Date()
    const cutoff24m = new Date(now)
    cutoff24m.setMonth(cutoff24m.getMonth() - 24)
    const recentBreach = hibp.breaches.some((b) => new Date(b.BreachDate) >= cutoff24m)
    if (recentBreach) count++
  }

  if (financial.finalScore < 40) count++
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
