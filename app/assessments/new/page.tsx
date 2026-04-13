import { redirect } from 'next/navigation'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'
import OrgLogo from '@/src/components/OrgLogo'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import AssessmentFlow from './AssessmentFlow'

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>
}) {
  const ctx = await getDbContext()
  if (!ctx) redirect('/')
  if (!hasRole(ctx.user.role, 'ANALYST')) redirect('/dashboard')

  const { prefill } = await searchParams

  return (
    <div className="min-h-screen bg-[#F4F3F8]">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <FidesSeal size={32} />
              <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
            </Link>
            <span className="text-[#E2DFF0]">·</span>
            <Link href="/assessments" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">
              Assessments
            </Link>
            <span className="text-[#E2DFF0]">·</span>
            <h1 className="text-[15px] font-medium text-[#1A1625]">New assessment</h1>
          </div>
          {(ctx.org.logoUrl || ctx.org.name !== 'My organization') && (
            <div className="flex items-center gap-2">
              {ctx.org.logoUrl && (
                <OrgLogo style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
              )}
              {ctx.org.name !== 'My organization' && (
                <span className="text-[13px] text-[#8B85A8]">{ctx.org.name}</span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <AssessmentFlow prefill={prefill} />
      </main>
    </div>
  )
}
