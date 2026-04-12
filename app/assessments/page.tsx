import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import AssessmentList from './AssessmentList'
import { db } from '@/src/db'
import { assessments, users } from '@/src/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; page?: string }>
}) {
  const ctx = await getDbContext()
  if (!ctx) redirect('/')

  const { tier, page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
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
      assessorName: users.displayName,
    })
    .from(assessments)
    .leftJoin(users, eq(assessments.createdBy, users.id))
    .where(
      and(
        eq(assessments.orgId, ctx.org.id),
        isNull(assessments.deletedAt),
        tier ? eq(assessments.riskTier, tier as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') : undefined
      )
    )
    .orderBy(desc(assessments.createdAt))
    .limit(limit)
    .offset(offset)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Assessments</h1>
          </div>
          <Link
            href="/assessments/new"
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            New assessment
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <AssessmentList
          rows={rows as AssessmentRow[]}
          currentTier={tier}
          page={page}
          hasMore={rows.length === limit}
          canModify={hasRole(ctx.user.role, 'ANALYST')}
        />
      </main>
    </div>
  )
}

export interface AssessmentRow {
  id: string
  vendorName: string
  companiesHouseNumber: string | null
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
  overallScore: number | null
  assessmentStatus: 'DRAFT' | 'COMPLETE'
  createdAt: Date
  assessorName: string | null
}
