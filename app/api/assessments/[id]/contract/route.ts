import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

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

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const contractDetails = {
    slaUptime: typeof body.slaUptime === 'string' ? body.slaUptime.trim() : undefined,
    rto: typeof body.rto === 'string' ? body.rto.trim() : undefined,
    rpo: typeof body.rpo === 'string' ? body.rpo.trim() : undefined,
    contractExpiry: typeof body.contractExpiry === 'string' ? body.contractExpiry : undefined,
    nextReviewDate: typeof body.nextReviewDate === 'string' ? body.nextReviewDate : undefined,
    accountManagerName: typeof body.accountManagerName === 'string' ? body.accountManagerName.trim() : undefined,
    accountManagerEmail: typeof body.accountManagerEmail === 'string' ? body.accountManagerEmail.trim() : undefined,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : undefined,
  }

  // Remove undefined keys
  const cleaned = Object.fromEntries(
    Object.entries(contractDetails).filter(([, v]) => v !== undefined && v !== '')
  )

  await db
    .update(assessments)
    .set({ contractDetails: cleaned, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId))

  return NextResponse.json({ ok: true })
}
