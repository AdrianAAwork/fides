import { redirect } from 'next/navigation'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'
import OrgLogo from '@/src/components/OrgLogo'
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
    <div className="min-h-screen bg-[#F4F3F8]">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <FidesSeal size={32} />
              <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
            </Link>
            <span className="text-[#E2DFF0]">·</span>
            <Link href="/dashboard" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">
              Dashboard
            </Link>
            <span className="text-[#E2DFF0]">·</span>
            <h1 className="text-[15px] font-medium text-[#1A1625]">Assessments</h1>
          </div>
          <div className="flex items-center gap-3">
            {(ctx.org.logoUrl || ctx.org.name !== 'My organization') && (
              <div className="flex items-center gap-2 border-r border-[#E2DFF0] pr-3">
                {ctx.org.logoUrl && (
                  <OrgLogo style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
                )}
                {ctx.org.name !== 'My organization' && (
                  <span className="text-[13px] text-[#8B85A8]">{ctx.org.name}</span>
                )}
              </div>
            )}
            {hasRole(ctx.user.role, 'ANALYST') && (
              <Link
                href="/assessments/new"
                className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors"
              >
                New assessment
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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
