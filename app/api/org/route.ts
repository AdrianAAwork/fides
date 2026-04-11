import { NextResponse } from 'next/server'
import { db } from '@/src/db'
import { organisations, users, assessments, certifications, questionnaires, doraClassification } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'

export async function GET() {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  return NextResponse.json({ org: ctx.org })
}

export async function PATCH(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    updates.name = name
  }

  if (typeof body.brandColor === 'string') {
    const color = body.brandColor.trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: 'Invalid hex color' }, { status: 400 })
    }
    updates.brandColor = color
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(organisations)
    .set(updates)
    .where(and(eq(organisations.id, ctx.org.id), isNull(organisations.deletedAt)))
    .returning()

  return NextResponse.json({ org: updated })
}

export async function DELETE() {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const orgId = ctx.org.id
  const now = new Date()

  // Soft delete all associated data, then the organisation itself
  // dora_classification has no deletedAt — touch updatedAt so triggers fire
  await db.update(doraClassification)
    .set({ isOverridden: doraClassification.isOverridden })
    .where(eq(doraClassification.orgId, orgId))

  const orgAssessments = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.orgId, orgId), isNull(assessments.deletedAt)))

  for (const a of orgAssessments) {
    // Soft-delete tables that have a deletedAt column
    await db.update(certifications)
      .set({ deletedAt: now })
      .where(and(eq(certifications.assessmentId, a.id), isNull(certifications.deletedAt)))

    await db.update(questionnaires)
      .set({ deletedAt: now })
      .where(and(eq(questionnaires.assessmentId, a.id), isNull(questionnaires.deletedAt)))

    // assessment_scores, reassessment_schedule, cert_alerts have no deletedAt — skipped
  }

  await db.update(assessments)
    .set({ deletedAt: now })
    .where(and(eq(assessments.orgId, orgId), isNull(assessments.deletedAt)))

  await db.update(users)
    .set({ deletedAt: now })
    .where(and(eq(users.orgId, orgId), isNull(users.deletedAt)))

  await db.update(organisations)
    .set({ deletedAt: now })
    .where(and(eq(organisations.id, orgId), isNull(organisations.deletedAt)))

  return NextResponse.json({ success: true })
}
