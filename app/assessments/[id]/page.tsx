import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, users, doraClassification, auditLog, certifications } from '@/src/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'
import DimensionCard from './DimensionCard'
import type { CertRow } from './DimensionCard'
import AssessmentActions from './AssessmentActions'
import DoraCard from './DoraCard'
import type { DoraRow } from './DoraCard'
import ContractCard from './ContractCard'
import type { ContractData } from './ContractCard'
import RegulatoryPanel from './RegulatoryPanel'

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-[#E6F1FB] text-[#0C447C]',
  MEDIUM: 'bg-[#EAF3DE] text-[#27500A]',
  HIGH: 'bg-[#FAEEDA] text-[#633806]',
  CRITICAL: 'bg-[#FCEBEB] text-[#791F1F]',
}

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

const ACTION_LABELS: Record<string, string> = {
  ASSESSMENT_CREATED: 'Assessment created',
  SCORE_OVERRIDDEN: 'Score adjusted',
  CLASSIFICATION_CONFIRMED: 'DORA classification confirmed',
  CLASSIFICATION_OVERRIDDEN: 'DORA classification overridden',
  CERT_ADDED: 'Certification added',
  CERT_DELETED: 'Certification removed',
}

function buildAuditDescription(entry: {
  actionType: string
  oldValue: unknown
  newValue: unknown
  reason: string | null
}): string {
  const oldVal = entry.oldValue as Record<string, unknown> | null | undefined
  const newVal = entry.newValue as Record<string, unknown> | null | undefined
  if (entry.actionType === 'SCORE_OVERRIDDEN') {
    const dim = (newVal?.dimension as string | undefined) ?? ''
    const oldScore = oldVal?.score
    const newScore = newVal?.score
    const parts: string[] = []
    if (dim) parts.push(dim.replace(/_/g, ' ').toLowerCase())
    if (oldScore != null && newScore != null) parts.push(`${oldScore} → ${newScore}`)
    if (entry.reason) parts.push(entry.reason)
    return parts.join(' · ')
  }
  if (entry.actionType === 'CLASSIFICATION_CONFIRMED') {
    const cls = (newVal?.classification as string | undefined) ?? ''
    return cls ? `Classified as ${cls}` : ''
  }
  if (entry.actionType === 'CLASSIFICATION_OVERRIDDEN') {
    const oldCls = (oldVal?.classification as string | undefined) ?? ''
    const newCls = (newVal?.classification as string | undefined) ?? ''
    const parts: string[] = []
    if (oldCls && newCls) parts.push(`${oldCls} → ${newCls}`)
    if (entry.reason) parts.push(entry.reason)
    return parts.join(' · ')
  }
  if (entry.actionType === 'CERT_ADDED') {
    const ct = (newVal?.certType as string | undefined)?.replace(/_/g, ' ') ?? ''
    return ct ? `${ct} · MANUAL` : ''
  }
  if (entry.actionType === 'CERT_DELETED') {
    const ct = (oldVal?.certType as string | undefined)?.replace(/_/g, ' ') ?? ''
    return ct
  }
  return ''
}

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await getDbContext()
  if (!ctx) redirect('/')

  const { id } = await params

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) notFound()

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

  const manualCerts = await db
    .select({
      id: certifications.id,
      certType: certifications.certType,
      issuingBody: certifications.issuingBody,
      auditPeriodStart: certifications.auditPeriodStart,
      auditPeriodEnd: certifications.auditPeriodEnd,
      expiryDate: certifications.expiryDate,
      sourceUrl: certifications.sourceUrl,
      notes: certifications.notes,
    })
    .from(certifications)
    .where(and(
      eq(certifications.assessmentId, id),
      eq(certifications.sourceType, 'MANUAL'),
      isNull(certifications.deletedAt),
    ))
    .orderBy(certifications.createdAt)

  const auditEntries = await db
    .select({
      id: auditLog.id,
      actionType: auditLog.actionType,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      reason: auditLog.reason,
      createdAt: auditLog.createdAt,
      userEmail: users.email,
      userDisplayName: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.assessmentId, id), eq(auditLog.orgId, ctx.org.id)))
    .orderBy(desc(auditLog.createdAt))

  const canOverride = hasRole(ctx.user.role, 'ANALYST')
  const canClassify = hasRole(ctx.user.role, 'ANALYST')
  const canDoraOverride = hasRole(ctx.user.role, 'ADMIN')

  const doraExisting: DoraRow | null = doraRow
    ? {
        serviceType: doraRow.serviceType,
        processesPersonalData: doraRow.processesPersonalData,
        lossImpactOver2hrs: doraRow.lossImpactOver2hrs,
        substituteAvailable: doraRow.substituteAvailable,
        regulatedActivitySubstitute: doraRow.regulatedActivitySubstitute,
        classification: doraRow.classification,
        classificationJustification: doraRow.classificationJustification,
        isOverridden: doraRow.isOverridden,
        overrideReason: doraRow.overrideReason,
        overriddenAt: doraRow.overriddenAt,
      }
    : null

  const contractDetails = assessment.contractDetails as ContractData | null

  // Build subtitle string
  const subtitleParts: string[] = []
  if (assessment.companiesHouseNumber) subtitleParts.push(`CH: ${assessment.companiesHouseNumber}`)
  if (assessment.lei) subtitleParts.push(`LEI: ${assessment.lei}`)
  if (assessment.sicCode) subtitleParts.push(`SIC: ${assessment.sicCode}`)
  if (assessment.jurisdiction) subtitleParts.push(assessment.jurisdiction)
  if (assessment.companyStatus) subtitleParts.push(assessment.companyStatus)

  const execSummary = assessment.execSummaryJson as {
    summary?: string
    recommended_action?: string
    key_concerns?: string[]
    status?: string
  } | null

  return (
    <div className="min-h-screen bg-[#F4F3F8] relative">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <FidesSeal size={32} />
              <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
            </Link>
            <span className="text-[#E2DFF0]">·</span>
            <Link href="/assessments" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">
              Assessments
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {(ctx.org.logoUrl || ctx.org.name !== 'My organization') && (
              <div className="flex items-center gap-2 border-r border-[#E2DFF0] pr-3">
                {ctx.org.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ctx.org.logoUrl} alt={ctx.org.name} style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
                )}
                {ctx.org.name !== 'My organization' && (
                  <span className="text-[13px] text-[#8B85A8]">{ctx.org.name}</span>
                )}
              </div>
            )}
            {hasRole(ctx.user.role, 'ANALYST') && (
              <AssessmentActions
                assessmentId={assessment.id}
                vendorName={assessment.vendorName}
              />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* ── Report header card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-medium text-[#1A1625] leading-tight">
                {assessment.vendorName}
              </h1>
              {subtitleParts.length > 0 && (
                <p className="text-[13px] text-[#8B85A8] mt-1">
                  {subtitleParts.join(' · ')}
                </p>
              )}
              <p className="text-[12px] text-[#B8B3CE] mt-1">
                Assessed {new Date(assessment.createdAt).toLocaleDateString('en-GB')}
                {assessor?.displayName ? ` by ${assessor.displayName}` : ''}
              </p>
            </div>
            {assessment.riskTier && (
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`inline-flex items-center px-4 py-1 rounded-full text-[14px] font-medium ${TIER_COLORS[assessment.riskTier] ?? 'bg-[#F9F8FD] text-[#5B5478]'}`}>
                  {assessment.riskTier}
                </span>
                {assessment.overallScore != null && (
                  <span className="text-[13px] text-[#8B85A8]">
                    Score: {assessment.overallScore}/100
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Meta grid */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#F9F8FD] border border-[#E2DFF0] rounded-lg px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Company status</p>
              <p className="text-[14px] text-[#1A1625]">{assessment.companyStatus ?? '—'}</p>
            </div>
            <div className="bg-[#F9F8FD] border border-[#E2DFF0] rounded-lg px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Jurisdiction</p>
              <p className="text-[14px] text-[#1A1625]">{assessment.jurisdiction ?? '—'}</p>
            </div>
            <div className="bg-[#F9F8FD] border border-[#E2DFF0] rounded-lg px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">DORA classification</p>
              {doraRow ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium border ${
                  doraRow.classification === 'CRITICAL' ? 'bg-[#FCEBEB] text-[#791F1F] border-[#FCEBEB]'
                  : doraRow.classification === 'IMPORTANT' ? 'bg-[#FAEEDA] text-[#633806] border-[#FAEEDA]'
                  : 'bg-[#EAF3DE] text-[#27500A] border-[#EAF3DE]'
                }`}>
                  {doraRow.classification}
                </span>
              ) : (
                <p className="text-[14px] text-[#B8B3CE]">Not classified</p>
              )}
            </div>
            <div className="bg-[#F9F8FD] border border-[#E2DFF0] rounded-lg px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Next review due</p>
              <p className="text-[14px] text-[#1A1625]">
                {contractDetails?.nextReviewDate
                  ? new Date(contractDetails.nextReviewDate).toLocaleDateString('en-GB')
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Executive summary ──────────────────────────────────────────────── */}
        {execSummary && execSummary.status !== 'summary_unavailable' && execSummary.summary && (
          <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8]">Executive summary</p>
            <p className="text-[14px] text-[#1A1625] leading-[1.75]">{execSummary.summary}</p>
            {execSummary.recommended_action && (
              <div className="border-l-[3px] border-[#BA7517] bg-[#FEF9EE] px-4 py-3 rounded-r-lg">
                <p className="text-[11px] text-[#BA7517] uppercase tracking-[0.06em] font-medium mb-1">Recommended action</p>
                <p className="text-[14px] text-[#633806]">{execSummary.recommended_action}</p>
              </div>
            )}
            {execSummary.key_concerns && execSummary.key_concerns.length > 0 && (
              <div>
                <p className="text-[11px] text-[#8B85A8] uppercase tracking-[0.06em] font-medium mb-2">Key concerns</p>
                <ul className="space-y-1.5">
                  {execSummary.key_concerns.map((concern, i) => (
                    <li key={i} className="flex items-start gap-2 text-[14px] text-[#1A1625]">
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#A32D2D] flex-shrink-0" />
                      {concern}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Dimension scores ───────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-3 px-1">
            Dimension scores
            <span className="ml-2 normal-case text-[#B8B3CE]">· click a card to expand</span>
          </p>
          <div className="space-y-2">
            {Object.entries(DIMENSION_LABELS).map(([dim, label]) => {
              const score = scores.find((s) => s.dimension === dim)
              if (!score) {
                return (
                  <div key={dim} className="bg-white rounded-xl border border-[#E2DFF0] px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-medium text-[#1A1625]">{label}</span>
                      <span className="text-[11px] text-[#8B85A8] bg-[#F9F8FD] border border-[#E2DFF0] px-1.5 py-0.5 rounded-full">
                        {DIMENSION_WEIGHTS[dim]}%
                      </span>
                    </div>
                    <p className="text-[13px] text-[#B8B3CE] mt-2">No data available</p>
                  </div>
                )
              }
              return (
                <DimensionCard
                  key={dim}
                  dimension={dim}
                  label={label}
                  weight={DIMENSION_WEIGHTS[dim]}
                  finalScore={score.finalScore}
                  rawScore={score.rawScore}
                  isOverridden={score.isOverridden}
                  overrideReason={score.overrideReason}
                  overriddenAt={score.overriddenAt}
                  sourceData={score.sourceData as Record<string, unknown> | null}
                  fetchedAt={score.fetchedAt}
                  scoreId={score.id}
                  assessmentId={id}
                  canOverride={canOverride}
                  certifications={dim === 'TRUST_CERTS' ? (manualCerts as CertRow[]) : undefined}
                />
              )
            })}
          </div>
        </div>

        {/* ── DORA / FCA classification ──────────────────────────────────────── */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-3 px-1">DORA / FCA classification</p>
          <DoraCard
            assessmentId={id}
            existing={doraExisting}
            canClassify={canClassify}
            canOverride={canDoraOverride}
          />
        </div>

        {/* ── Contract & SLA ─────────────────────────────────────────────────── */}
        <ContractCard
          assessmentId={id}
          existing={contractDetails}
          canEdit={canOverride}
        />

        {/* ── Regulatory references ──────────────────────────────────────────── */}
        <RegulatoryPanel />

        {/* ── Audit trail ────────────────────────────────────────────────────── */}
        {auditEntries.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-3 px-1">Audit trail</p>
            <div className="bg-white rounded-xl border border-[#E2DFF0] divide-y divide-[#E2DFF0]">
              {auditEntries.map((entry) => {
                const performer = entry.userDisplayName ?? entry.userEmail ?? 'System'
                const actionLabel = ACTION_LABELS[entry.actionType] ?? entry.actionType
                const description = buildAuditDescription(entry)
                return (
                  <div key={entry.id} className="px-5 py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#1A1625]">{actionLabel}</p>
                      {description && <p className="text-[12px] text-[#5B5478] mt-0.5">{description}</p>}
                      <p className="text-[12px] text-[#B8B3CE] mt-0.5">{performer}</p>
                    </div>
                    <p className="text-[11px] text-[#B8B3CE] flex-shrink-0 whitespace-nowrap mt-0.5">
                      {new Date(entry.createdAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Report footer ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#E2DFF0] px-7 py-5 flex items-center gap-5">
          <FidesSeal size={56} />
          <div className="space-y-0.5">
            <p className="text-[12px] text-[#8B85A8]">
              Generated by Fides · AI-assisted vendor risk assessment
            </p>
            <p className="text-[12px] text-[#8B85A8]">
              Companies House · GLEIF · OFSI/OFAC/EU sanctions · NCSC · NewsAPI
            </p>
            <p className="text-[12px] text-[#B8B3CE]">
              Assessment ID: {id} · {new Date(assessment.createdAt).toLocaleDateString('en-GB')} · For internal use only
            </p>
          </div>
        </div>

      </main>

      {/* Slide-over for RegulatoryPanel is rendered inside RegulatoryPanel with position:absolute */}
    </div>
  )
}
