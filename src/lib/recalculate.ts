import { rollUpOverallBand } from '@/src/lib/pipeline/scoring'
import type { TrustBand } from '@/src/lib/pipeline/types'

type Tier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

function bandToTier(band: TrustBand): Tier {
  switch (band) {
    case 'High': return 'LOW'
    case 'Medium': return 'MEDIUM'
    case 'Low': return 'HIGH'
    case 'Needs review': return 'HIGH'
    case 'Not assessed': return 'MEDIUM'
  }
}

// ── Band-based recalculate (new assessments) ──────────────────────────────────

export function recalculateOverallBand(
  scores: Array<{ dimension: string; suggestedBand: string | null; confirmedBand: string | null }>
): { suggestedOverallBand: TrustBand; riskTier: Tier } {
  const band = rollUpOverallBand(scores)
  return { suggestedOverallBand: band, riskTier: bandToTier(band) }
}

// ── Legacy numeric recalculate (old assessments without bands) ────────────────

const WEIGHTS: Record<string, number> = {
  FINANCIAL_HEALTH: 20,
  BREACH_HISTORY: 25,
  SANCTIONS: 15,
  OWNERSHIP: 10,
  TRUST_CERTS: 20,
  NEWS_SENTIMENT: 10,
}

function toTier(score: number): Tier {
  if (score >= 75) return 'LOW'
  if (score >= 50) return 'MEDIUM'
  if (score >= 25) return 'HIGH'
  return 'CRITICAL'
}

export function recalculateOverall(
  scores: Array<{ dimension: string; finalScore: number; sourceData: unknown; suggestedBand?: string | null; confirmedBand?: string | null }>
): { overallScore: number; riskTier: Tier; suggestedOverallBand?: TrustBand } {
  // If any row has a band, use band-based recalculation
  const hasBands = scores.some(s => s.suggestedBand != null)
  if (hasBands) {
    const { suggestedOverallBand, riskTier } = recalculateOverallBand(
      scores.map(s => ({ dimension: s.dimension, suggestedBand: s.suggestedBand ?? null, confirmedBand: s.confirmedBand ?? null }))
    )
    return { overallScore: 0, riskTier, suggestedOverallBand }
  }

  // Legacy: weighted average of finalScores
  let total = 0
  for (const s of scores) {
    const weight = WEIGHTS[s.dimension] ?? 0
    total += (s.finalScore * weight) / 100
  }
  const overallScore = Math.round(total)
  let riskTier = toTier(overallScore)

  const sd = (dim: string) =>
    (scores.find((s) => s.dimension === dim)?.sourceData ?? {}) as Record<string, unknown>

  const sanctionsData = sd('SANCTIONS')
  const financialData = sd('FINANCIAL_HEALTH')

  const highestLevel = sanctionsData.highest_level as string | undefined
  if (highestLevel && highestLevel !== 'none') {
    if (riskTier === 'LOW' || riskTier === 'MEDIUM') riskTier = 'HIGH'
  }

  const companyStatus = financialData.company_status as string | undefined
  if (companyStatus && companyStatus !== 'active' && companyStatus !== 'unknown') {
    if (riskTier === 'LOW' || riskTier === 'MEDIUM') riskTier = 'HIGH'
  }

  const gc = financialData.going_concern as { going_concern?: boolean; confidence?: string; status?: string } | undefined
  if (gc?.status === 'checked' && gc.going_concern && gc.confidence === 'high') {
    if (riskTier === 'LOW') riskTier = 'MEDIUM'
  }

  return { overallScore, riskTier }
}
