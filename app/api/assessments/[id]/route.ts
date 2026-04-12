import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { db } from '@/src/db'
import { assessments, assessmentScores } from '@/src/db/schema'
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
