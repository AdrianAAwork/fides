import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { certifications } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id, certId } = await params
  const body = await req.json().catch(() => null)
  if (typeof body?.isRelevant !== 'boolean') {
    return NextResponse.json({ error: 'isRelevant must be a boolean' }, { status: 400 })
  }

  const [updated] = await db
    .update(certifications)
    .set({ isRelevant: body.isRelevant, updatedAt: new Date() })
    .where(
      and(
        eq(certifications.id, certId),
        eq(certifications.assessmentId, id),
        eq(certifications.orgId, ctx.org.id),
        isNull(certifications.deletedAt),
      )
    )
    .returning({ id: certifications.id })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
