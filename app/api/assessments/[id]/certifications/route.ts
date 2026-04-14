import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, certifications, auditLog } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { recalculateOverall } from '@/src/lib/recalculate'

const VALID_CERT_TYPES = new Set([
  'SOC2_TYPE_I', 'SOC2_TYPE_II', 'ISO_27001', 'ISO_22301', 'ISO_27701',
  'CYBER_ESSENTIALS', 'CYBER_ESSENTIALS_PLUS', 'PCI_DSS', 'CSA_STAR', 'OTHER',
])

const CERT_POINTS: Record<string, number> = {
  SOC2_TYPE_II: 40,
  SOC2_TYPE_I: 25,
  ISO_27001: 30,
  ISO_22301: 15,
  ISO_27701: 15,
  PCI_DSS: 30,
  CYBER_ESSENTIALS: 15,
  CYBER_ESSENTIALS_PLUS: 20,
  CSA_STAR: 15,
  OTHER: 10,
}

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

  const certType = typeof body.certType === 'string' ? body.certType : ''
  if (!VALID_CERT_TYPES.has(certType)) {
    return NextResponse.json({ error: 'Invalid cert type' }, { status: 400 })
  }

  const issuingBody = typeof body.issuingBody === 'string' ? body.issuingBody.trim().slice(0, 255) || null : null
  const auditPeriodStart = typeof body.auditPeriodStart === 'string' && body.auditPeriodStart ? body.auditPeriodStart : null
  const auditPeriodEnd = typeof body.auditPeriodEnd === 'string' && body.auditPeriodEnd ? body.auditPeriodEnd : null
  const expiryDate = typeof body.expiryDate === 'string' && body.expiryDate ? body.expiryDate : null
  const rawSourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim().slice(0, 1000) || null : null
  // Validate sourceUrl to http/https only — prevents stored XSS via javascript: scheme links
  // rendered as <a href={sourceUrl}> in DimensionCard.tsx
  if (rawSourceUrl !== null) {
    let urlScheme: string | null = null
    try { urlScheme = new URL(rawSourceUrl).protocol } catch { /* invalid URL */ }
    if (urlScheme !== 'http:' && urlScheme !== 'https:') {
      return NextResponse.json({ error: 'sourceUrl must be a valid http or https URL' }, { status: 400 })
    }
  }
  const sourceUrl = rawSourceUrl
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) || null : null

  const result = await db.transaction(async (tx) => {
    // 1. Insert the certification row
    const [newCert] = await tx
      .insert(certifications)
      .values({
        assessmentId,
        orgId: ctx.org.id,
        certType: certType as typeof certifications.certType._.data,
        issuingBody,
        auditPeriodStart,
        auditPeriodEnd,
        expiryDate,
        sourceType: 'MANUAL',
        sourceUrl,
        notes,
        createdBy: ctx.user.id,
        retrievedAt: new Date(),
      })
      .returning()

    // 2. Get the current TRUST_CERTS score row
    const [scoreRow] = await tx
      .select()
      .from(assessmentScores)
      .where(and(eq(assessmentScores.assessmentId, assessmentId), eq(assessmentScores.dimension, 'TRUST_CERTS')))
      .limit(1)

    if (scoreRow) {
      // 3. Fetch all active manual certs (including the one just inserted)
      const manualCerts = await tx
        .select({ certType: certifications.certType })
        .from(certifications)
        .where(and(
          eq(certifications.assessmentId, assessmentId),
          eq(certifications.sourceType, 'MANUAL'),
          isNull(certifications.deletedAt),
        ))

      const manualPoints = manualCerts.reduce((sum, c) => sum + (CERT_POINTS[c.certType] ?? 0), 0)
      const newFinalScore = Math.min(scoreRow.rawScore + manualPoints, 100)

      await tx
        .update(assessmentScores)
        .set({ finalScore: newFinalScore, isOverridden: false, overrideReason: null, overriddenBy: null, overriddenAt: null })
        .where(eq(assessmentScores.id, scoreRow.id))

      // 4. Recalculate overall score
      const allScores = await tx
        .select({ dimension: assessmentScores.dimension, finalScore: assessmentScores.finalScore, sourceData: assessmentScores.sourceData })
        .from(assessmentScores)
        .where(eq(assessmentScores.assessmentId, assessmentId))

      const updatedScores = allScores.map(s =>
        s.dimension === 'TRUST_CERTS' ? { ...s, finalScore: newFinalScore } : s
      )
      const { overallScore, riskTier } = recalculateOverall(updatedScores)

      await tx
        .update(assessments)
        .set({ overallScore, riskTier, updatedAt: new Date() })
        .where(eq(assessments.id, assessmentId))
    }

    // 5. Audit log
    await tx.insert(auditLog).values({
      assessmentId,
      orgId: ctx.org.id,
      userId: ctx.user.id,
      actionType: 'CERT_ADDED',
      newValue: { certType, source: 'MANUAL', issuingBody } as Record<string, unknown>,
    })

    return newCert
  })

  return NextResponse.json({ ok: true, cert: result })
}
