import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { db } from '@/src/db'
import { auditLog, users, assessments } from '@/src/db/schema'
import { and, eq, desc, isNull } from 'drizzle-orm'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await params

  // Verify org ownership
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const entries = await db
    .select({
      id: auditLog.id,
      actionType: auditLog.actionType,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      reason: auditLog.reason,
      createdAt: auditLog.createdAt,
      userEmail: users.email,
      userDisplayName: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.assessmentId, id), eq(auditLog.orgId, ctx.org.id)))
    .orderBy(desc(auditLog.createdAt))

  return NextResponse.json({ entries })
}
