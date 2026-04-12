import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getDbContext } from '@/src/lib/session'
import { db } from '@/src/db'
import { assessments, assessmentScores, users } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import DimensionCard from './DimensionCard'

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
          {assessment.riskTier && (
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                TIER_COLORS[assessment.riskTier] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {assessment.riskTier}
            </span>
          )}
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
            <p className="text-sm text-gray-400 italic">Pending (Phase 6)</p>
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
                  isOverridden={score.isOverridden}
                  overrideReason={score.overrideReason}
                  sourceData={score.sourceData as Record<string, unknown> | null}
                  fetchedAt={score.fetchedAt}
                />
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
