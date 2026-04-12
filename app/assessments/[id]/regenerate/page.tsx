import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import { db } from '@/src/db'
import { assessments } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import RegenerateFlow from './RegenerateFlow'

export default async function RegeneratePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await getDbContext()
  if (!ctx) redirect('/')
  if (!hasRole(ctx.user.role, 'ANALYST')) redirect(`/assessments`)

  const { id } = await params

  const [assessment] = await db
    .select({
      id: assessments.id,
      vendorName: assessments.vendorName,
      companiesHouseNumber: assessments.companiesHouseNumber,
    })
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.orgId, ctx.org.id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link href={`/assessments/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← {assessment.vendorName}
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Re-run assessment</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <RegenerateFlow
          previousAssessmentId={id}
          vendorName={assessment.vendorName}
          companiesHouseNumber={assessment.companiesHouseNumber ?? undefined}
        />
      </main>
    </div>
  )
}
