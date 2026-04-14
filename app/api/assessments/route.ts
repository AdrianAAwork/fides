import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { runPipeline } from '@/src/lib/pipeline'
import { db } from '@/src/db'
import { assessments, users, rateLimits } from '@/src/db/schema'
import { and, eq, isNull, desc, sql } from 'drizzle-orm'

const DAILY_ASSESSMENT_LIMIT = 20

// Pipeline makes multiple external API calls + 3 Claude calls — needs extended timeout
export const maxDuration = 300

export async function POST(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/assessments] failed to parse request body:', msg)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[POST /api/assessments] body received:', JSON.stringify(body))

  // TODO: SECURITY (MEDIUM) — vendorName is interpolated into Claude prompts; a crafted name
  // could attempt prompt injection. The 200-char cap below limits payload size but consider
  // additional prompt-injection defences (e.g. clear role/context delimiters in Claude prompts).
  const vendorName = typeof body.vendorName === 'string' ? body.vendorName.trim().slice(0, 200) : ''
  if (!vendorName) {
    console.error('[POST /api/assessments] vendorName missing or empty. body.vendorName:', body.vendorName)
    return NextResponse.json({ error: 'vendorName is required' }, { status: 400 })
  }

  const companiesHouseNumber =
    typeof body.companiesHouseNumber === 'string' ? body.companiesHouseNumber.trim() : undefined

  // Rate limiting — check and increment the per-user daily counter
  const today = new Date().toISOString().split('T')[0]

  const [rateRow] = await db
    .select({ assessmentCount: rateLimits.assessmentCount })
    .from(rateLimits)
    .where(and(eq(rateLimits.userId, ctx.user.id), eq(rateLimits.date, today)))
    .limit(1)

  if ((rateRow?.assessmentCount ?? 0) >= DAILY_ASSESSMENT_LIMIT) {
    return NextResponse.json(
      { error: `Daily assessment limit reached (${DAILY_ASSESSMENT_LIMIT}/day). Please try again tomorrow.` },
      { status: 429 }
    )
  }

  await db
    .insert(rateLimits)
    .values({ userId: ctx.user.id, orgId: ctx.org.id, date: today, assessmentCount: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.userId, rateLimits.date],
      set: { assessmentCount: sql`${rateLimits.assessmentCount} + 1` },
    })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        const pipeline = runPipeline({
          vendorName,
          companiesHouseNumber,
          orgId: ctx.org.id,
          userId: ctx.user.id,
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

export async function GET(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  // TODO: SECURITY (LOW) — tierFilter was previously cast without runtime validation; fixed below.
  const VALID_TIERS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  const rawTier = searchParams.get('tier')
  const tierFilter = rawTier && VALID_TIERS.has(rawTier) ? rawTier as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' : null
  if (rawTier && !tierFilter) {
    return NextResponse.json({ error: 'Invalid tier filter' }, { status: 400 })
  }
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = 20
  const offset = (page - 1) * limit

  const rows = await db
    .select({
      id: assessments.id,
      vendorName: assessments.vendorName,
      companiesHouseNumber: assessments.companiesHouseNumber,
      riskTier: assessments.riskTier,
      overallScore: assessments.overallScore,
      assessmentStatus: assessments.assessmentStatus,
      createdAt: assessments.createdAt,
      createdBy: assessments.createdBy,
      assessorName: users.displayName,
    })
    .from(assessments)
    .leftJoin(users, eq(assessments.createdBy, users.id))
    .where(
      and(
        eq(assessments.orgId, ctx.org.id),
        isNull(assessments.deletedAt),
        tierFilter ? eq(assessments.riskTier, tierFilter) : undefined
      )
    )
    .orderBy(desc(assessments.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ assessments: rows, page, limit })
}
