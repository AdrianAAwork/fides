import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, auditLog } from '@/src/db/schema'
import { and, eq } from 'drizzle-orm'
import { recalculateOverall } from '@/src/lib/recalculate'
import type { TrustBand } from '@/src/lib/pipeline/types'

const VALID_BANDS: Set<TrustBand> = new Set(['High', 'Medium', 'Low', 'Not assessed', 'Needs review'])

const VALID_DIMENSIONS = new Set([
  'FINANCIAL_HEALTH', 'BREACH_HISTORY', 'SANCTIONS', 'OWNERSHIP', 'TRUST_CERTS', 'NEWS_SENTIMENT',
])

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; dimension: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id: assessmentId, dimension } = await params

  if (!VALID_DIMENSIONS.has(dimension)) {
    return NextResponse.json({ error: 'Invalid dimension' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Band-based confirm/override
  const confirmedBand = typeof body.confirmedBand === 'string' ? body.confirmedBand as TrustBand : null
  const note = typeof body.note === 'string' ? body.note.trim() : ''

  if (!confirmedBand || !VALID_BANDS.has(confirmedBand)) {
    return NextResponse.json({ error: 'confirmedBand must be one of: High, Medium, Low, Not assessed, Needs review' }, { status: 400 })
  }

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.orgId, ctx.org.id)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

  const [scoreRow] = await db
    .select()
    .from(assessmentScores)
    .where(
      and(
        eq(assessmentScores.assessmentId, assessmentId),
        eq(assessmentScores.dimension, dimension as typeof assessmentScores.dimension._.data)
      )
    )
    .limit(1)

  if (!scoreRow) return NextResponse.json({ error: 'Score not found' }, { status: 404 })

  const suggestedBand = scoreRow.suggestedBand
  const isOverride = confirmedBand !== suggestedBand

  // Note is required when overriding (different from suggestion); optional when confirming
  if (isOverride && note.length < 10) {
    return NextResponse.json({ error: 'A note (at least 10 characters) is required when overriding the suggested band.' }, { status: 400 })
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .update(assessmentScores)
      .set({
        confirmedBand,
        isOverridden: isOverride,
        overrideReason: note || null,
        overriddenBy: ctx.user.id,
        overriddenAt: new Date(),
      })
      .where(eq(assessmentScores.id, scoreRow.id))

    const allScores = await tx
      .select({
        dimension: assessmentScores.dimension,
        finalScore: assessmentScores.finalScore,
        sourceData: assessmentScores.sourceData,
        suggestedBand: assessmentScores.suggestedBand,
        confirmedBand: assessmentScores.confirmedBand,
      })
      .from(assessmentScores)
      .where(eq(assessmentScores.assessmentId, assessmentId))

    const updatedScores = allScores.map((s) =>
      s.dimension === dimension ? { ...s, confirmedBand } : s
    )

    const { overallScore, riskTier, suggestedOverallBand } = recalculateOverall(updatedScores)

    await tx
      .update(assessments)
      .set({
        overallScore: overallScore || null,
        riskTier,
        suggestedOverallBand: suggestedOverallBand ?? null,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, assessmentId))

    await tx.insert(auditLog).values({
      assessmentId,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'BAND_CONFIRMED',
      oldValue: { dimension, band: suggestedBand } as Record<string, unknown>,
      newValue: { dimension, band: confirmedBand, isOverride } as Record<string, unknown>,
      reason: note || null,
    })

    return { overallScore, riskTier, suggestedOverallBand }
  })

  return NextResponse.json({ ok: true, ...result })
}
