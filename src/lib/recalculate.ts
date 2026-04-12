/**
 * Recalculate the overall score and risk tier from the current dimension
 * final_scores after a manual override. Mirrors the logic in scoring.ts
 * but reads the special-rule inputs from the stored sourceData JSONB.
 */

const WEIGHTS: Record<string, number> = {
  FINANCIAL_HEALTH: 20,
  BREACH_HISTORY: 25,
  SANCTIONS: 15,
  OWNERSHIP: 10,
  TRUST_CERTS: 20,
  NEWS_SENTIMENT: 10,
}

type Tier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

function toTier(score: number): Tier {
  if (score >= 75) return 'LOW'
  if (score >= 50) return 'MEDIUM'
  if (score >= 25) return 'HIGH'
  return 'CRITICAL'
}

export function recalculateOverall(
  scores: Array<{ dimension: string; finalScore: number; sourceData: unknown }>
): { overallScore: number; riskTier: Tier } {
  // Weighted average of all six dimension final scores
  let total = 0
  for (const s of scores) {
    const weight = WEIGHTS[s.dimension] ?? 0
    total += (s.finalScore * weight) / 100
  }
  const overallScore = Math.round(total)
  let riskTier = toTier(overallScore)

  // Special override rules — derived from sourceData of the relevant dimensions
  const sd = (dim: string) =>
    (scores.find((s) => s.dimension === dim)?.sourceData ?? {}) as Record<string, unknown>

  const sanctionsData = sd('SANCTIONS')
  const financialData = sd('FINANCIAL_HEALTH')

  // Sanctions match → minimum HIGH
  const highestLevel = sanctionsData.highest_level as string | undefined
  if (highestLevel && highestLevel !== 'none') {
    if (riskTier === 'LOW' || riskTier === 'MEDIUM') riskTier = 'HIGH'
  }

  // Inactive company → minimum HIGH
  const companyStatus = financialData.company_status as string | undefined
  if (companyStatus && companyStatus !== 'active' && companyStatus !== 'unknown') {
    if (riskTier === 'LOW' || riskTier === 'MEDIUM') riskTier = 'HIGH'
  }

  // Going concern (high confidence) → minimum MEDIUM
  const gc = financialData.going_concern as {
    going_concern?: boolean
    confidence?: string
    status?: string
  } | undefined
  if (gc?.status === 'checked' && gc.going_concern && gc.confidence === 'high') {
    if (riskTier === 'LOW') riskTier = 'MEDIUM'
  }

  return { overallScore, riskTier }
}
