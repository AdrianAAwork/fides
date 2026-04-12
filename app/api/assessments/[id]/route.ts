import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, auditLog } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await params

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, id),
        eq(assessments.orgId, ctx.org.id),
        isNull(assessments.deletedAt)
      )
    )
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const scores = await db
    .select()
    .from(assessmentScores)
    .where(eq(assessmentScores.assessmentId, id))

  return NextResponse.json({ assessment, scores })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await params

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.transaction(async (tx) => {
    await tx
      .update(assessments)
      .set({ deletedAt: new Date() })
      .where(eq(assessments.id, id))

    await tx.insert(auditLog).values({
      assessmentId: id,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'ASSESSMENT_DELETED',
      newValue: {} as Record<string, unknown>,
    })
  })

  return NextResponse.json({ ok: true })
}
