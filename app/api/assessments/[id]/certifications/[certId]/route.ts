import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, certifications, auditLog } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { recalculateOverall } from '@/src/lib/recalculate'

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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  if (!hasRole(ctx.user.role, 'ANALYST')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id: assessmentId, certId } = await params

  const [cert] = await db
    .select()
    .from(certifications)
    .where(and(
      eq(certifications.id, certId),
      eq(certifications.assessmentId, assessmentId),
      eq(certifications.orgId, ctx.org.id),
      isNull(certifications.deletedAt),
    ))
    .limit(1)

  if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
  if (cert.sourceType !== 'MANUAL') {
    return NextResponse.json({ error: 'Only manually added certifications can be removed' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    // 1. Soft-delete the cert
    await tx
      .update(certifications)
      .set({ deletedAt: new Date() })
      .where(eq(certifications.id, certId))

    // 2. Get the current TRUST_CERTS score row
    const [scoreRow] = await tx
      .select()
      .from(assessmentScores)
      .where(and(eq(assessmentScores.assessmentId, assessmentId), eq(assessmentScores.dimension, 'TRUST_CERTS')))
      .limit(1)

    if (scoreRow) {
      // 3. Fetch remaining active manual certs (excluding the one just deleted)
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

      // 4. Recalculate overall
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
      actionType: 'CERT_DELETED',
      oldValue: { certType: cert.certType, certId } as Record<string, unknown>,
    })
  })

  return NextResponse.json({ ok: true })
}
