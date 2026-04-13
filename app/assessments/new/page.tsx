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
    <div className="min-h-screen bg-[#F4F3F8]">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#5B3FD4] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
          </div>
          <span className="text-[#E2DFF0]">·</span>
          <Link href="/assessments" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">
            Assessments
          </Link>
          <span className="text-[#E2DFF0]">·</span>
          <h1 className="text-[15px] font-medium text-[#1A1625]">New assessment</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <AssessmentFlow />
      </main>
    </div>
  )
}
