import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { checkGlobalCeiling } from '@/src/lib/globalRateLimit'
import { db } from '@/src/db'
import { assessments } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { runPipeline } from '@/src/lib/pipeline'

export const maxDuration = 300

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  if (!ctx.session.user.email_verified) {
    return NextResponse.json({ error: 'Please verify your email before generating reports.' }, { status: 403 })
  }

  if (await checkGlobalCeiling()) {
    return NextResponse.json(
      { error: "We're experiencing high demand right now. Please try again tomorrow." },
      { status: 429 }
    )
  }

  const { id } = await params

  const [assessment] = await db
    .select({
      vendorName: assessments.vendorName,
      companiesHouseNumber: assessments.companiesHouseNumber,
    })
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        const pipeline = runPipeline({
          vendorName: assessment.vendorName,
          companiesHouseNumber: assessment.companiesHouseNumber ?? undefined,
          orgId: ctx.org.id,
          userId: ctx.user.id,
          previousAssessmentId: id,
        })
        for await (const event of pipeline) {
          send(event)
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Pipeline failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
