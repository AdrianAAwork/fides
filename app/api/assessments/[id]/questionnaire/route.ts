import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { db } from '@/src/db'
import {
  assessments,
  assessmentScores,
  certifications,
  doraClassification,
  questionnaires,
  auditLog,
} from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import Questionnaire from '@/src/lib/pdf/Questionnaire'
import type { QuestionnaireSection, QuestionItem } from '@/src/lib/pdf/Questionnaire'
import type { ContractData } from '@/app/assessments/[id]/ContractCard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HIGH_JURISDICTIONS = new Set([
  'GB', 'US', 'AU', 'CA', 'JP', 'CH', 'NO', 'NZ', 'SG',
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

function isNonStandardJurisdiction(jurisdiction: string | null): boolean {
  if (!jurisdiction) return false
  const j = jurisdiction.toUpperCase().trim()
  return !HIGH_JURISDICTIONS.has(j)
}

export async function POST(
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

  const scores = await db
    .select()
    .from(assessmentScores)
    .where(eq(assessmentScores.assessmentId, id))

  const [doraRow] = await db
    .select()
    .from(doraClassification)
    .where(eq(doraClassification.assessmentId, id))
    .limit(1)

  const allCerts = await db
    .select({ certType: certifications.certType, sourceType: certifications.sourceType })
    .from(certifications)
    .where(and(eq(certifications.assessmentId, id), isNull(certifications.deletedAt)))

  const contractDetails = assessment.contractDetails as ContractData | null

  // ── Determine conditions ──────────────────────────────────────────────────

  const trustScore = scores.find(s => s.dimension === 'TRUST_CERTS')
  const trustData = trustScore?.sourceData as Record<string, unknown> | null
  const autoCertsFound = (trustData?.certs_found as Array<{ certType: string }>) ?? []
  const manualCerts = allCerts.filter(c => c.sourceType === 'MANUAL')

  const noTrustPortal = trustData?.status === 'not_found'
  const noManualCerts = manualCerts.length === 0
  const noTrustPortalAndNoCerts = noTrustPortal && noManualCerts

  const allCertTypes = [
    ...autoCertsFound.map((c) => c.certType),
    ...allCerts.map((c) => c.certType),
  ]
  const hasSoc2OrIso = allCertTypes.some(t =>
    ['SOC2_TYPE_I', 'SOC2_TYPE_II', 'ISO_27001'].includes(t)
  )

  const isImportantOrCritical =
    doraRow?.classification === 'IMPORTANT' || doraRow?.classification === 'CRITICAL'

  const financialScore = scores.find(s => s.dimension === 'FINANCIAL_HEALTH')
  const finData = financialScore?.sourceData as Record<string, unknown> | null
  const goingConcern = (finData?.going_concern as { going_concern?: boolean })?.going_concern ?? false

  const companyNotActive =
    assessment.companyStatus !== null &&
    assessment.companyStatus !== 'active'

  const nonStandardJurisdiction = isNonStandardJurisdiction(assessment.jurisdiction)

  const breachScore = scores.find(s => s.dimension === 'BREACH_HISTORY')
  const breachFinalScore = breachScore?.finalScore ?? 100
  const hasRecentBreach = breachFinalScore < 75

  const processesPersonalData = doraRow?.processesPersonalData ?? false

  // ── Build questionnaire sections ──────────────────────────────────────────

  const sections: QuestionnaireSection[] = []

  // Section 1 — Information security (always)
  const sec1: QuestionItem[] = [
    {
      number: 'Q1',
      questionText: 'Do you hold a current SOC 2 Type II report? If so, please provide the audit period and issuing auditor.',
      prefillNote: !hasSoc2OrIso
        ? 'Our records show no SOC 2 certification was identified via public trust portals. Please confirm current status.'
        : undefined,
    },
    {
      number: 'Q2',
      questionText: 'Do you hold a current ISO 27001 certificate? If so, please provide the certificate number, issuing body, and expiry date.',
    },
    {
      number: 'Q3',
      questionText: 'Do you have a documented Information Security Management System (ISMS)?',
    },
    {
      number: 'Q4',
      questionText: 'When did you last conduct a penetration test? Please summarise the scope and key findings.',
    },
    {
      number: 'Q5',
      questionText: 'Do you have a formal vulnerability disclosure or bug bounty programme?',
    },
  ]
  sections.push({ title: 'Information Security', questions: sec1 })

  // Section 2 — Data protection (if processes personal data)
  if (processesPersonalData) {
    sections.push({
      title: 'Data Protection',
      questions: [
        { number: 'Q6', questionText: 'Who is your nominated Data Protection Officer?' },
        { number: 'Q7', questionText: 'In which countries is personal data processed and stored?' },
        { number: 'Q8', questionText: 'What is your data retention policy for personal data processed on our behalf?' },
        {
          number: 'Q9',
          questionText: 'Have you suffered any personal data breaches in the last 24 months? If so, please describe.',
          prefillNote: hasRecentBreach
            ? 'Our screening identified potential breach incidents. Please provide details and remediation steps taken.'
            : undefined,
        },
      ],
    })
  }

  // Section 3 — Operational resilience (always)
  sections.push({
    title: 'Operational Resilience',
    questions: [
      {
        number: 'Q10',
        questionText: 'What is your documented Recovery Time Objective (RTO)?',
        prefillNote: contractDetails?.rto
          ? `Our records show an agreed RTO of: ${contractDetails.rto}. Please confirm this remains accurate.`
          : undefined,
      },
      {
        number: 'Q11',
        questionText: 'What is your documented Recovery Point Objective (RPO)?',
        prefillNote: contractDetails?.rpo
          ? `Our records show an agreed RPO of: ${contractDetails.rpo}. Please confirm this remains accurate.`
          : undefined,
      },
      {
        number: 'Q12',
        questionText: 'When did you last test your business continuity plan? Please summarise the outcome.',
      },
      {
        number: 'Q13',
        questionText: 'Do you have a documented exit and transition plan that would allow us to migrate away from your service within a defined timeframe?',
      },
    ],
  })

  // Section 4 — Sub-outsourcing (always)
  sections.push({
    title: 'Sub-Outsourcing',
    questions: [
      {
        number: 'Q14',
        questionText: 'Do you sub-outsource any material components of the service you provide to us? If so, to whom and in which jurisdictions?',
      },
      {
        number: 'Q15',
        questionText: 'How do you manage the security of your own third-party suppliers?',
      },
    ],
  })

  // Section 5 — Conditional questions
  const conditional: QuestionItem[] = []
  if (goingConcern) {
    conditional.push({
      number: 'Q16',
      questionText: 'Please provide an update on the financial position referenced in your most recent audit report, including any remediation steps taken.',
    })
  }
  if (hasRecentBreach) {
    conditional.push({
      number: 'Q17',
      questionText: 'Please describe the breach incident(s) identified in our screening, including remediation steps and current status.',
    })
  }
  if (nonStandardJurisdiction) {
    conditional.push({
      number: 'Q18',
      questionText: 'Are you subject to any laws or regulations in your jurisdiction that could conflict with your obligations to us under UK/EU data protection law?',
    })
  }
  if (doraRow?.classification === 'CRITICAL') {
    conditional.push({
      number: 'Q19',
      questionText: 'Can you provide evidence of your compliance with DORA Article 28 obligations as they apply to your service?',
    })
    conditional.push({
      number: 'Q20',
      questionText: 'Do you have a lead overseer designation or are you subject to regulatory oversight in any EU member state?',
    })
  }

  if (conditional.length > 0) {
    sections.push({ title: 'Additional Questions', questions: conditional })
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0]

  const qElement = React.createElement(Questionnaire, {
    data: {
      vendorName: assessment.vendorName,
      orgName: ctx.org.name,
      assessmentId: id,
      generatedDate: today,
      sections,
    },
  }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(qElement)

  // ── Upsert questionnaire record ───────────────────────────────────────────

  const reasons: string[] = []
  if (noTrustPortalAndNoCerts) reasons.push('no_trust_certs')
  if (!hasSoc2OrIso) reasons.push('no_soc2_or_iso')
  if (isImportantOrCritical) reasons.push('dora_important_or_critical')
  if (goingConcern) reasons.push('going_concern')
  if (companyNotActive) reasons.push('company_not_active')
  if (nonStandardJurisdiction) reasons.push('non_standard_jurisdiction')

  const [existing] = await db
    .select({ id: questionnaires.id })
    .from(questionnaires)
    .where(and(eq(questionnaires.assessmentId, id), isNull(questionnaires.deletedAt)))
    .limit(1)

  if (existing) {
    await db
      .update(questionnaires)
      .set({ status: 'DISPATCHED', generatedAt: new Date(), triggerReasons: reasons as unknown as Record<string, unknown> })
      .where(eq(questionnaires.id, existing.id))
  } else {
    await db.insert(questionnaires).values({
      assessmentId: id,
      orgId: ctx.org.id,
      status: 'DISPATCHED',
      triggerReasons: reasons as unknown as Record<string, unknown>,
      generatedAt: new Date(),
    })
  }

  await db.insert(auditLog).values({
    assessmentId: id,
    orgId: ctx.org.id,
    userId: ctx.user.id,
    actionType: 'QUESTIONNAIRE_TRIGGERED',
    newValue: { reasons } as Record<string, unknown>,
  })

  const vendorSlug = assessment.vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `${vendorSlug}-questionnaire-${today}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
