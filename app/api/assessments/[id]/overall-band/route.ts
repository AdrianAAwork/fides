import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, auditLog } from '@/src/db/schema'
import { and, eq } from 'drizzle-orm'
import type { TrustBand } from '@/src/lib/pipeline/types'

const VALID_BANDS: Set<TrustBand> = new Set(['High', 'Medium', 'Low', 'Not assessed', 'Needs review'])

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id: assessmentId } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const confirmedBand = typeof body.confirmedBand === 'string' ? body.confirmedBand as TrustBand : null
  const note = typeof body.note === 'string' ? body.note.trim() : ''

  if (!confirmedBand || !VALID_BANDS.has(confirmedBand)) {
    return NextResponse.json({ error: 'confirmedBand must be one of: High, Medium, Low, Not assessed, Needs review' }, { status: 400 })
  }

  const [assessment] = await db
    .select({ id: assessments.id, suggestedOverallBand: assessments.suggestedOverallBand })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.orgId, ctx.org.id)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

  const isOverride = confirmedBand !== assessment.suggestedOverallBand

  if (isOverride && note.length < 10) {
    return NextResponse.json({ error: 'A note (at least 10 characters) is required when overriding the suggested band.' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    await tx
      .update(assessments)
      .set({
        confirmedOverallBand: confirmedBand,
        confirmedOverallBy: ctx.user.id,
        confirmedOverallAt: new Date(),
        confirmedOverallNote: note || null,
        updatedAt: new Date(),
      })
      .where(eq(assessments.id, assessmentId))

    await tx.insert(auditLog).values({
      assessmentId,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'BAND_CONFIRMED',
      oldValue: { dimension: 'OVERALL', band: assessment.suggestedOverallBand } as Record<string, unknown>,
      newValue: { dimension: 'OVERALL', band: confirmedBand, isOverride } as Record<string, unknown>,
      reason: note || null,
    })
  })

  return NextResponse.json({ ok: true })
}
