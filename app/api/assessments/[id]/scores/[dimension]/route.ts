import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, auditLog } from '@/src/db/schema'
import { and, eq } from 'drizzle-orm'
import { recalculateOverall } from '@/src/lib/recalculate'

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

  const VALID_DIMENSIONS = new Set([
    'FINANCIAL_HEALTH', 'BREACH_HISTORY', 'SANCTIONS', 'OWNERSHIP', 'TRUST_CERTS', 'NEWS_SENTIMENT',
  ])
  if (!VALID_DIMENSIONS.has(dimension)) {
    return NextResponse.json({ error: 'Invalid dimension' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const newScore = typeof body.newScore === 'number' ? body.newScore : Number(body.newScore)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!Number.isInteger(newScore) || newScore < 0 || newScore > 100) {
    return NextResponse.json({ error: 'Score must be an integer between 0 and 100' }, { status: 400 })
  }
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Reason must be at least 10 characters' }, { status: 400 })
  }

  // Verify the assessment belongs to this org
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.orgId, ctx.org.id)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

  // Find the score row for this dimension
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

  const oldScore = scoreRow.finalScore

  // Update the score row and recalculate overall — in a transaction
  const result = await db.transaction(async (tx) => {
    // 1. Update the dimension score
    await tx
      .update(assessmentScores)
      .set({
        finalScore: newScore,
        isOverridden: true,
        overrideReason: reason,
        overriddenBy: ctx.user.id,
        overriddenAt: new Date(),
      })
      .where(eq(assessmentScores.id, scoreRow.id))

    // 2. Fetch all current scores to recalculate overall
    const allScores = await tx
      .select({
        dimension: assessmentScores.dimension,
        finalScore: assessmentScores.finalScore,
        sourceData: assessmentScores.sourceData,
      })
      .from(assessmentScores)
      .where(eq(assessmentScores.assessmentId, assessmentId))

    // Substitute the new score for the dimension being overridden
    const updatedScores = allScores.map((s) =>
      s.dimension === dimension ? { ...s, finalScore: newScore } : s
    )

    const { overallScore, riskTier } = recalculateOverall(updatedScores)

    // 3. Update the assessment record
    await tx
      .update(assessments)
      .set({ overallScore, riskTier, updatedAt: new Date() })
      .where(eq(assessments.id, assessmentId))

    // 4. Audit log
    await tx.insert(auditLog).values({
      assessmentId,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'SCORE_OVERRIDDEN',
      oldValue: { dimension, score: oldScore } as Record<string, unknown>,
      newValue: { dimension, score: newScore } as Record<string, unknown>,
      reason,
    })

    return { overallScore, riskTier }
  })

  return NextResponse.json({ ok: true, ...result })
}
