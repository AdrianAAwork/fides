import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments, assessmentScores, users, doraClassification, auditLog } from '@/src/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'
import DimensionCard from './DimensionCard'
import AssessmentActions from './AssessmentActions'
import DoraCard from './DoraCard'
import type { DoraRow } from './DoraCard'

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
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

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  if (score >= 25) return 'text-orange-600'
  return 'text-red-600'
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

  const execSummary = assessment.execSummaryJson as {
    summary?: string
    recommended_action?: string
    key_concerns?: string[]
    status?: string
  } | null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/assessments" className="text-sm text-gray-500 hover:text-gray-700">
              ← Assessments
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">{assessment.vendorName}</h1>
          </div>
          <div className="flex items-center gap-3">
            {assessment.riskTier && (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                  TIER_COLORS[assessment.riskTier] ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                {assessment.riskTier}
              </span>
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Meta card */}
        <div className="bg-white rounded-lg shadow p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Overall score</p>
            <p className={`text-2xl font-bold ${assessment.overallScore != null ? scoreColor(assessment.overallScore) : 'text-gray-400'}`}>
              {assessment.overallScore ?? '—'}<span className="text-sm font-normal text-gray-400">/100</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Date assessed</p>
            <p className="text-sm text-gray-700">{new Date(assessment.createdAt).toLocaleDateString('en-GB')}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Assessed by</p>
            <p className="text-sm text-gray-700">{assessor?.displayName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">CH number</p>
            <p className="text-sm text-gray-700">{assessment.companiesHouseNumber ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              assessment.assessmentStatus === 'COMPLETE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {assessment.assessmentStatus}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Jurisdiction</p>
            <p className="text-sm text-gray-700">{assessment.jurisdiction ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Company status</p>
            <p className="text-sm text-gray-700">{assessment.companyStatus ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">DORA classification</p>
            {doraRow ? (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                doraRow.classification === 'CRITICAL' ? 'bg-red-100 text-red-800 border-red-200'
                : doraRow.classification === 'IMPORTANT' ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-green-100 text-green-800 border-green-200'
              }`}>
                {doraRow.classification}
              </span>
            ) : (
              <p className="text-sm text-gray-400 italic">Not classified</p>
            )}
          </div>
        </div>

        {/* Executive summary */}
        {execSummary && execSummary.status !== 'summary_unavailable' && execSummary.summary && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Executive summary</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{execSummary.summary}</p>
            {execSummary.recommended_action && (
              <div className="rounded-md bg-indigo-50 border border-indigo-100 px-4 py-3">
                <p className="text-xs text-indigo-500 uppercase tracking-wide font-medium mb-1">Recommended action</p>
                <p className="text-sm text-indigo-800">{execSummary.recommended_action}</p>
              </div>
            )}
            {execSummary.key_concerns && execSummary.key_concerns.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Key concerns</p>
                <ul className="space-y-1">
                  {execSummary.key_concerns.map((concern, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      {concern}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Dimension scores */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Dimension scores
            <span className="ml-2 text-xs font-normal text-gray-400">Click a card to see how the score was calculated</span>
          </h2>
          <div className="space-y-3">
            {Object.entries(DIMENSION_LABELS).map(([dim, label]) => {
              const score = scores.find((s) => s.dimension === dim)
              if (!score) {
                return (
                  <div key={dim} className="bg-white rounded-lg shadow px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{DIMENSION_WEIGHTS[dim]}%</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">No data available</p>
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
                />
              )
            })}
          </div>
        </div>

        {/* DORA / FCA classification */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">DORA / FCA classification</h2>
          <DoraCard
            assessmentId={id}
            existing={doraExisting}
            canClassify={canClassify}
            canOverride={canDoraOverride}
          />
        </div>

        {/* Audit trail */}
        {auditEntries.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Audit trail</h2>
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {auditEntries.map((entry) => {
                const performer = entry.userDisplayName ?? entry.userEmail ?? 'System'
                const actionLabel = ACTION_LABELS[entry.actionType] ?? entry.actionType
                const description = buildAuditDescription(entry)
                return (
                  <div key={entry.id} className="px-5 py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{actionLabel}</p>
                      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{performer}</p>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Audit helpers ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  ASSESSMENT_CREATED: 'Assessment created',
  SCORE_OVERRIDDEN: 'Score adjusted',
  CLASSIFICATION_CONFIRMED: 'DORA classification confirmed',
  CLASSIFICATION_OVERRIDDEN: 'DORA classification overridden',
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
  return ''
}
