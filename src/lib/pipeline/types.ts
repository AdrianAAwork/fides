// ─── Companies House ──────────────────────────────────────────────────────────

export interface ChOfficer {
  name: string
  role: string
  appointed_on?: string
  resigned_on?: string
}

export interface ChPsc {
  name: string
  nationality?: string
  natures_of_control?: string[]
  ceased?: boolean
}

export interface ChFiling {
  date: string
  description: string
  category?: string
}

export interface CompaniesHouseData {
  company_name: string
  company_number: string
  company_status: string
  date_of_creation?: string
  registered_office_address?: Record<string, string>
  jurisdiction?: string              // CH top-level jurisdiction (UK registration domain for FC companies)
  foreignOriginatingCountry?: string // foreign_company_details.originating_registry.country — home country for FC companies
  foreignGoverningLaw?: string       // foreign_company_details.governed_by — may also carry home country
  sic_codes?: string[]
  type?: string
  accounts?: {
    next_due?: string
    overdue?: boolean
  }
  confirmation_statement?: {
    next_due?: string
    overdue?: boolean
  }
  officers: ChOfficer[]
  psc: ChPsc[]
  filings: ChFiling[]
  website?: string
  error?: string
}

// ─── GLEIF ────────────────────────────────────────────────────────────────────

export interface GleifData {
  lei?: string
  legalName?: string
  jurisdiction?: string
  category?: string
  status?: string
  registeredAs?: string
  ultimateParent?: {
    lei?: string
    name?: string
  }
  matchMethod?: 'registeredAs' | 'nameSearch'  // how the LEI was found — nameSearch can return wrong entity
  error?: string
}

// ─── Sanctions ────────────────────────────────────────────────────────────────

export type SanctionMatchLevel = 'confirmed' | 'possible' | 'none'

export interface SanctionMatch {
  name: string
  matchedAgainst: string
  similarity: number
  level: SanctionMatchLevel
  source: string
  referenceNumber?: string | null
}

export interface SanctionsData {
  screened: string[]
  matches: SanctionMatch[]
  highestLevel: SanctionMatchLevel
  error?: string
}

// ─── News ─────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  title: string
  description?: string
}

export interface NewsData {
  articles: NewsArticle[]
  articlesCount?: number
  queryNote?: string
  error?: string
}

export interface HibpData {
  enabled: boolean
  breaches: Array<{
    Name: string
    BreachDate: string
    DataClasses?: string[]
  }>
  error?: string
}

// ─── Trust Portals ────────────────────────────────────────────────────────────

export interface ScrapeMeta {
  attempted: boolean
  http_status?: number
  found: boolean
  keywords_found?: string[]
  error?: string | null
}

export interface TrustCertFound {
  certType: string
  source: string
  expiryDate?: string  // never populated by the automated pipeline — only by manual analyst entry
  issuingBody?: string
  sourceUrl?: string
  notes?: string       // rawLabel for certs that mapped to OTHER
  category?: 'security_cert' | 'privacy_framework' | 'other'
}

export interface TrustPortalsData {
  certs_found: TrustCertFound[]          // security_cert items only — used for scoring
  frameworks_found?: TrustCertFound[]    // privacy_framework + other items — display only, not scored
  status: 'found' | 'inconclusive' | 'not_found'
  scrape_metadata: {
    iasme?: ScrapeMeta
    vanta?: ScrapeMeta
    safebase?: ScrapeMeta
    vendor_site?: ScrapeMeta
    agent?: Record<string, unknown>  // trust-finder agent result blob
  }
  error?: string
}

// ─── Claude ───────────────────────────────────────────────────────────────────

export interface GoingConcernResult {
  going_concern: boolean
  confidence: 'high' | 'medium' | 'low'
  summary: string
  status: 'checked' | 'not_checked' | 'summary_unavailable'
}

export interface NewsSentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  risk_items: Array<{ headline: string; risk_type: string }>
  summary: string
  status: 'checked' | 'not_checked' | 'summary_unavailable'
  articlesCount?: number
  queryNote?: string
}

export interface ExecSummaryResult {
  summary: string
  recommended_action: string
  key_concerns: string[]
  status: 'checked' | 'summary_unavailable'
}

// ─── Trust Bands ─────────────────────────────────────────────────────────────

export type TrustBand = 'High' | 'Medium' | 'Low' | 'Not assessed' | 'Needs review'

// Easily-changed label constant — swap this to rename across the product.
export const FIDES_TRUST_LABEL = 'Fides Suggested Trust'

export interface DimensionBand {
  dimension: string
  suggestedBand: TrustBand
  sourceData: Record<string, unknown>
  fetchedAt: Date
}

export interface PipelineBands {
  financial_health: DimensionBand
  breach_history: DimensionBand
  sanctions: DimensionBand
  ownership: DimensionBand
  trust_certs: DimensionBand
  news_sentiment: DimensionBand
  suggestedOverallBand: TrustBand
  // Kept for backward-compat callers (reassessment schedule, audit log, PDF)
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  overallScore: number
}

// ─── Legacy scoring (kept for reading old stored data) ────────────────────────

export interface DimensionScore {
  dimension: string
  rawScore: number
  finalScore: number
  sourceData: Record<string, unknown>
  fetchedAt: Date
}

export interface PipelineScores {
  financial_health: DimensionScore
  breach_history: DimensionScore
  sanctions: DimensionScore
  ownership: DimensionScore
  trust_certs: DimensionScore
  news_sentiment: DimensionScore
  overallScore: number
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

// ─── Pipeline result ──────────────────────────────────────────────────────────

export interface PipelineResult {
  ch: CompaniesHouseData
  gleif: GleifData
  sanctions: SanctionsData
  news: NewsData
  hibp: HibpData
  trustPortals: TrustPortalsData
  goingConcern: GoingConcernResult
  newsSentiment: NewsSentimentResult
  scores: PipelineScores
  execSummary: ExecSummaryResult
}
