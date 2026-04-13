import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { db } from '@/src/db'
import {
  assessments,
  assessmentScores,
  certifications,
  doraClassification,
  auditLog,
  users,
} from '@/src/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import AssessmentReport from '@/src/lib/pdf/AssessmentReport'
import type { AssessmentPdfData, PdfScore } from '@/src/lib/pdf/AssessmentReport'
import type { ContractData } from '@/app/assessments/[id]/ContractCard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DIMENSION_LABELS: Record<string, string> = {
  FINANCIAL_HEALTH: 'Financial health',
  BREACH_HISTORY: 'Breach history',
  SANCTIONS: 'Sanctions',
  OWNERSHIP: 'Ownership & jurisdiction',
  TRUST_CERTS: 'Trust & certifications',
  NEWS_SENTIMENT: 'News sentiment',
}

const DIMENSION_WEIGHTS: Record<string, number> = {
  FINANCIAL_HEALTH: 20,
  BREACH_HISTORY: 25,
  SANCTIONS: 15,
  OWNERSHIP: 10,
  TRUST_CERTS: 20,
  NEWS_SENTIMENT: 10,
}

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
    .where(and(eq(assessments.id, id), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [assessor] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, assessment.createdBy))
    .limit(1)

  const scores = await db
    .select()
    .from(assessmentScores)
    .where(eq(assessmentScores.assessmentId, id))

  const [doraRow] = await db
    .select()
    .from(doraClassification)
    .where(eq(doraClassification.assessmentId, id))
    .limit(1)

  const certs = await db
    .select({
      certType: certifications.certType,
      sourceType: certifications.sourceType,
      issuingBody: certifications.issuingBody,
      expiryDate: certifications.expiryDate,
      notes: certifications.notes,
    })
    .from(certifications)
    .where(and(eq(certifications.assessmentId, id), isNull(certifications.deletedAt)))

  const auditEntries = await db
    .select({
      actionType: auditLog.actionType,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      reason: auditLog.reason,
      createdAt: auditLog.createdAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.assessmentId, id), eq(auditLog.orgId, ctx.org.id)))
    .orderBy(desc(auditLog.createdAt))

  const orderedDimensions = ['FINANCIAL_HEALTH', 'BREACH_HISTORY', 'SANCTIONS', 'OWNERSHIP', 'TRUST_CERTS', 'NEWS_SENTIMENT']

  const pdfScores: PdfScore[] = orderedDimensions
    .map(dim => {
      const s = scores.find(sc => sc.dimension === dim)
      if (!s) return null
      return {
        dimension: dim,
        label: DIMENSION_LABELS[dim] ?? dim,
        weight: DIMENSION_WEIGHTS[dim] ?? 0,
        rawScore: s.rawScore,
        finalScore: s.finalScore,
        isOverridden: s.isOverridden,
        overrideReason: s.overrideReason,
      }
    })
    .filter((s): s is PdfScore => s !== null)

  const execSummary = assessment.execSummaryJson as {
    summary?: string
    recommended_action?: string
    key_concerns?: string[]
  } | null

  const contractDetails = assessment.contractDetails as ContractData | null

  const data: AssessmentPdfData = {
    assessment: {
      id: assessment.id,
      vendorName: assessment.vendorName,
      companiesHouseNumber: assessment.companiesHouseNumber,
      lei: assessment.lei,
      sicCode: assessment.sicCode,
      jurisdiction: assessment.jurisdiction,
      companyStatus: assessment.companyStatus,
      incorporationDate: assessment.incorporationDate,
      riskTier: assessment.riskTier ?? 'MEDIUM',
      overallScore: assessment.overallScore ?? 0,
      createdAt: assessment.createdAt,
    },
    assessorName: assessor?.displayName ?? null,
    orgName: ctx.org.name,
    scores: pdfScores,
    dora: doraRow ? {
      classification: doraRow.classification,
      classificationJustification: doraRow.classificationJustification,
      serviceType: doraRow.serviceType,
      processesPersonalData: doraRow.processesPersonalData,
      lossImpactOver2hrs: doraRow.lossImpactOver2hrs,
      substituteAvailable: doraRow.substituteAvailable,
      regulatedActivitySubstitute: doraRow.regulatedActivitySubstitute,
      isOverridden: doraRow.isOverridden,
      overrideReason: doraRow.overrideReason,
    } : null,
    certifications: certs,
    contractDetails,
    auditEntries,
    execSummary,
  }

  const element = React.createElement(AssessmentReport, { data }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)

  const vendorSlug = assessment.vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const dateStr = new Date(assessment.createdAt).toISOString().split('T')[0]
  const filename = `${vendorSlug}-assessment-${dateStr}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
