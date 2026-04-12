import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import AssessmentFlow from './AssessmentFlow'

export default async function NewAssessmentPage() {
  const ctx = await getDbContext()
  if (!ctx) redirect('/')
  if (!hasRole(ctx.user.role, 'ANALYST')) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/assessments" className="text-sm text-gray-500 hover:text-gray-700">
              ← Assessments
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">New assessment</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <AssessmentFlow />
      </main>
    </div>
  )
}
