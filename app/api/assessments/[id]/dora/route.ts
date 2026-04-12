import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, doraClassification, auditLog } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

// ── Classification logic ──────────────────────────────────────────────────────

interface DoraAnswers {
  serviceType: string
  processesPersonalData: boolean
  lossImpactOver2hrs: boolean
  substituteAvailable: boolean
  regulatedActivity: boolean
}

type DoraClass = 'CRITICAL' | 'IMPORTANT' | 'STANDARD'

const HIGH_RISK_SERVICE_TYPES = ['cloud/hosting', 'payment processing']

function classify(a: DoraAnswers): DoraClass {
  // CRITICAL
  if (a.processesPersonalData && a.lossImpactOver2hrs && !a.substituteAvailable) return 'CRITICAL'
  if (a.regulatedActivity && !a.substituteAvailable) return 'CRITICAL'
  // IMPORTANT
  if (a.processesPersonalData && a.lossImpactOver2hrs) return 'IMPORTANT'
  if (a.regulatedActivity) return 'IMPORTANT'
  if (HIGH_RISK_SERVICE_TYPES.some((t) => a.serviceType.toLowerCase().includes(t)) && !a.substituteAvailable) return 'IMPORTANT'
  return 'STANDARD'
}

function buildJustification(a: DoraAnswers, c: DoraClass): string {
  if (c === 'CRITICAL') {
    const parts: string[] = []
    if (a.processesPersonalData && a.lossImpactOver2hrs && !a.substituteAvailable) {
      parts.push(
        'it processes personal data on your behalf, its unavailability would disrupt operations for more than 2 hours, and no readily available substitute exists'
      )
    }
    if (a.regulatedActivity && !a.substituteAvailable) {
      parts.push('it supports directly regulated activity and no readily available substitute exists')
    }
    return (
      `This vendor has been classified as CRITICAL under DORA Article 28 and FCA outsourcing guidance. ` +
      `Specifically, ${parts.join('; ')}. ` +
      `Enhanced due diligence, concentration risk assessment, contractual exit provisions, and annual resilience testing are required.`
    )
  }

  if (c === 'IMPORTANT') {
    const parts: string[] = []
    if (a.processesPersonalData && a.lossImpactOver2hrs) {
      parts.push('it processes personal data and its unavailability would disrupt operations for more than 2 hours')
    }
    if (a.regulatedActivity) {
      parts.push('it supports directly regulated activity')
    }
    if (
      HIGH_RISK_SERVICE_TYPES.some((t) => a.serviceType.toLowerCase().includes(t)) &&
      !a.substituteAvailable
    ) {
      parts.push(`it provides ${a.serviceType} services for which no readily available substitute exists`)
    }
    return (
      `This vendor has been classified as IMPORTANT under DORA Article 28 and FCA outsourcing guidance (FG16/5). ` +
      `Specifically, ${parts.join('; ')}. ` +
      `Material due diligence, ongoing monitoring, and documented exit strategies are required.`
    )
  }

  return (
    'This vendor has been classified as STANDARD. ' +
    'Based on the information provided, it does not meet the criteria for CRITICAL or IMPORTANT classification ' +
    'under DORA Article 28 or FCA outsourcing guidance (FG16/5). ' +
    'Standard contractual protections and periodic due diligence reviews apply.'
  )
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function getAssessment(assessmentId: string, orgId: string) {
  const [row] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.orgId, orgId), isNull(assessments.deletedAt)))
    .limit(1)
  return row ?? null
}

/** Submit the 5 classification questions */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id: assessmentId } = await params
  if (!await getAssessment(assessmentId, ctx.org.id)) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const serviceType = typeof body.serviceType === 'string' ? body.serviceType.trim() : ''
  if (!serviceType) return NextResponse.json({ error: 'serviceType is required' }, { status: 400 })

  const answers: DoraAnswers = {
    serviceType,
    processesPersonalData: Boolean(body.processesPersonalData),
    lossImpactOver2hrs: Boolean(body.lossImpactOver2hrs),
    substituteAvailable: Boolean(body.substituteAvailable),
    regulatedActivity: Boolean(body.regulatedActivity),
  }

  const classification = classify(answers)
  const justification = buildJustification(answers, classification)

  await db.transaction(async (tx) => {
    await tx
      .insert(doraClassification)
      .values({
        assessmentId,
        orgId: ctx.org.id,
        serviceType: answers.serviceType,
        processesPersonalData: answers.processesPersonalData,
        lossImpactOver2hrs: answers.lossImpactOver2hrs,
        substituteAvailable: answers.substituteAvailable,
        regulatedActivitySubstitute: answers.regulatedActivity,
        classification,
        classificationJustification: justification,
      })
      .onConflictDoUpdate({
        target: doraClassification.assessmentId,
        set: {
          serviceType: answers.serviceType,
          processesPersonalData: answers.processesPersonalData,
          lossImpactOver2hrs: answers.lossImpactOver2hrs,
          substituteAvailable: answers.substituteAvailable,
          regulatedActivitySubstitute: answers.regulatedActivity,
          classification,
          classificationJustification: justification,
          isOverridden: false,
          overrideReason: null,
          overriddenBy: null,
          overriddenAt: null,
          updatedAt: new Date(),
        },
      })

    await tx.insert(auditLog).values({
      assessmentId,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'CLASSIFICATION_CONFIRMED',
      newValue: { classification, serviceType: answers.serviceType } as Record<string, unknown>,
    })
  })

  return NextResponse.json({ classification, justification })
}

/** Admin override of an existing classification */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }

  const { id: assessmentId } = await params
  if (!await getAssessment(assessmentId, ctx.org.id)) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const newClassification = body.classification as string
  if (!['CRITICAL', 'IMPORTANT', 'STANDARD'].includes(newClassification)) {
    return NextResponse.json({ error: 'classification must be CRITICAL, IMPORTANT, or STANDARD' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Reason must be at least 10 characters' }, { status: 400 })
  }

  const [existing] = await db
    .select({ id: doraClassification.id, classification: doraClassification.classification })
    .from(doraClassification)
    .where(eq(doraClassification.assessmentId, assessmentId))
    .limit(1)

  if (!existing) return NextResponse.json({ error: 'No classification found to override' }, { status: 404 })

  await db.transaction(async (tx) => {
    await tx
      .update(doraClassification)
      .set({
        classification: newClassification as 'CRITICAL' | 'IMPORTANT' | 'STANDARD',
        isOverridden: true,
        overrideReason: reason,
        overriddenBy: ctx.user.id,
        overriddenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(doraClassification.assessmentId, assessmentId))

    await tx.insert(auditLog).values({
      assessmentId,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'CLASSIFICATION_OVERRIDDEN',
      oldValue: { classification: existing.classification } as Record<string, unknown>,
      newValue: { classification: newClassification } as Record<string, unknown>,
      reason,
    })
  })

  return NextResponse.json({ ok: true, classification: newClassification })
}
