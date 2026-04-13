import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'
import OrgLogo from '@/src/components/OrgLogo'
import { db } from '@/src/db'
import { users, inviteTokens, assessments, certAlerts, certifications, reassessmentSchedule } from '@/src/db/schema'
import { and, count, eq, isNull, desc, lte } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { CLAIMS, hasRole } from '@/src/lib/auth'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
}

const TIER_COLORS: Record<string, string> = {
  LOW: 'bg-[#E6F1FB] text-[#0C447C]',
  MEDIUM: 'bg-[#EAF3DE] text-[#27500A]',
  HIGH: 'bg-[#FAEEDA] text-[#633806]',
  CRITICAL: 'bg-[#FCEBEB] text-[#791F1F]',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>
}) {
  const session = await getSession()
  if (!session?.user) {
    redirect('/api/auth/login?returnTo=/dashboard')
  }

  const needsOnboarding = session.user[CLAIMS.NEEDS_ONBOARDING] === true
  if (needsOnboarding) {
    redirect('/onboarding')
  }

  const ctx = await getDbContext()
  if (!ctx) {
    redirect('/api/auth/login?returnTo=/dashboard')
  }

  const { org, user } = ctx

  const [{ memberCount }] = await db
    .select({ memberCount: count() })
    .from(users)
    .where(and(eq(users.orgId, org.id), isNull(users.deletedAt)))

  const [pendingUpgrade] = await db
    .select({ id: inviteTokens.id })
    .from(inviteTokens)
    .where(
      and(eq(inviteTokens.usedBy, user.id), eq(inviteTokens.status, 'PENDING_UPGRADE')),
    )
    .limit(1)

  const { pending } = await searchParams
  const showPendingBanner = !!(pendingUpgrade || pending === '1')

  const isSolo = org.accountType === 'SOLO'

  const recentAssessments = await db
    .select({
      id: assessments.id,
      vendorName: assessments.vendorName,
      companiesHouseNumber: assessments.companiesHouseNumber,
      riskTier: assessments.riskTier,
      overallScore: assessments.overallScore,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .where(and(eq(assessments.orgId, org.id), isNull(assessments.deletedAt)))
    .orderBy(desc(assessments.createdAt))
    .limit(5)

  const canCreateAssessment = hasRole(user.role, 'ANALYST')

  // Cert alerts
  const activeCertAlerts = await db
    .select({
      certType: certifications.certType,
      expiryDate: certifications.expiryDate,
      alertType: certAlerts.alertType,
      daysRemaining: certAlerts.daysRemaining,
      vendorName: assessments.vendorName,
      assessmentId: assessments.id,
    })
    .from(certAlerts)
    .innerJoin(certifications, eq(certAlerts.certId, certifications.id))
    .innerJoin(assessments, eq(certAlerts.assessmentId, assessments.id))
    .where(
      and(
        eq(certAlerts.orgId, org.id),
        eq(certAlerts.acknowledged, false),
        isNull(certifications.deletedAt),
        isNull(assessments.deletedAt),
      )
    )
    .orderBy(certAlerts.daysRemaining)
    .limit(10)

  // Vendors due for reassessment within 30 days
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  const dueForReassessment = await db
    .select({
      vendorName: assessments.vendorName,
      companiesHouseNumber: assessments.companiesHouseNumber,
      scheduledDate: reassessmentSchedule.scheduledDate,
      assessmentId: assessments.id,
    })
    .from(reassessmentSchedule)
    .innerJoin(assessments, eq(reassessmentSchedule.assessmentId, assessments.id))
    .where(
      and(
        eq(reassessmentSchedule.orgId, org.id),
        eq(reassessmentSchedule.isComplete, false),
        lte(reassessmentSchedule.scheduledDate, thirtyDaysFromNow.toISOString().split('T')[0]),
        isNull(assessments.deletedAt),
      )
    )
    .orderBy(reassessmentSchedule.scheduledDate)

  return (
    <div className="min-h-screen bg-[#F4F3F8]">
      <header className="bg-white border-b border-[#E2DFF0]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <FidesSeal size={32} />
            <span className="text-[15px] font-medium text-[#1A1625]">Fides</span>
          </Link>
          <div className="flex items-center gap-4">
            {(org.logoUrl || org.name !== 'My organization') && (
              <div className="flex items-center gap-2 border-r border-[#E2DFF0] pr-4">
                {org.logoUrl && (
                  <OrgLogo style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
                )}
                {org.name !== 'My organization' && (
                  <span className="text-[13px] text-[#8B85A8]">{org.name}</span>
                )}
              </div>
            )}
            <Link href="/settings/profile" className="text-[13px] text-[#5B5478] hover:text-[#1A1625]">
              {user.displayName}
            </Link>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/logout" className="text-[13px] text-[#8B85A8] hover:text-[#5B5478]">
              Sign out
            </a>
          </div>
        </div>
      </header>

      {showPendingBanner && (
        <div className="bg-[#FAEEDA] border-b border-[#E2DFF0] px-4 py-3 text-[13px] text-[#633806] text-center">
          Your account is pending activation. The organisation admin has been notified to upgrade their plan.
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {/* Workspace card */}
        <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[15px] font-medium text-[#1A1625]">
                {isSolo ? 'My Workspace' : org.name}
              </h2>
              {!isSolo && (
                <p className="mt-1 text-[13px] text-[#8B85A8]">
                  {memberCount} of {org.memberLimit} members
                </p>
              )}
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EEEDFE] text-[#5B3FD4]">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-[#E2DFF0]">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Display name</dt>
              <dd className="text-[14px] text-[#1A1625]">{user.displayName}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.06em] text-[#8B85A8] mb-1">Email</dt>
              <dd className="text-[14px] text-[#1A1625]">{user.email}</dd>
            </div>
          </dl>

          <div className="flex gap-4 mt-4 pt-4 border-t border-[#E2DFF0]">
            {user.role === 'ADMIN' && (
              <Link href="/settings/organisation" className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium">
                Organisation settings →
              </Link>
            )}
            <Link href="/settings/profile" className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium">
              Profile settings →
            </Link>
          </div>
        </div>

        {/* Assessments card */}
        <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-medium text-[#1A1625]">Recent assessments</h2>
            <div className="flex items-center gap-3">
              <Link href="/assessments" className="text-[13px] text-[#5B3FD4] hover:text-[#3C3489] font-medium">
                View all →
              </Link>
              {canCreateAssessment && (
                <Link
                  href="/assessments/new"
                  className="px-4 py-2 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors"
                >
                  New assessment
                </Link>
              )}
            </div>
          </div>

          {recentAssessments.length === 0 ? (
            <p className="text-[14px] text-[#8B85A8] py-4">
              No assessments yet.{' '}
              {canCreateAssessment && (
                <Link href="/assessments/new" className="text-[#5B3FD4] hover:text-[#3C3489]">
                  Start your first assessment →
                </Link>
              )}
            </p>
          ) : (
            <div className="divide-y divide-[#E2DFF0]">
              {recentAssessments.map((a) => (
                <Link
                  key={a.id}
                  href={`/assessments/${a.id}`}
                  className="flex items-center justify-between py-3 hover:bg-[#F9F8FD] -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div>
                    <p className="text-[14px] font-medium text-[#1A1625]">{a.vendorName}</p>
                    <p className="text-[12px] text-[#B8B3CE] mt-0.5">
                      {a.companiesHouseNumber ? `CH: ${a.companiesHouseNumber} · ` : ''}
                      {new Date(a.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  {a.riskTier && (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-medium ${TIER_COLORS[a.riskTier] ?? 'bg-gray-100 text-gray-700'}`}>
                      {a.riskTier}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Certification alerts ───────────────────────────────────────────── */}
        {activeCertAlerts.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
            <h2 className="text-[15px] font-medium text-[#1A1625] mb-4">Certification alerts</h2>
            <div className="divide-y divide-[#E2DFF0]">
              {activeCertAlerts.map((alert, i) => {
                const days = alert.daysRemaining ?? 0
                const expired = alert.alertType === 'EXPIRED'
                const badge =
                  expired
                    ? 'bg-[#3C1515] text-[#FCEBEB]'
                    : days <= 7
                    ? 'bg-[#FCEBEB] text-[#791F1F]'
                    : days <= 30
                    ? 'bg-[#FEE2CC] text-[#7C3A0A]'
                    : 'bg-[#FAEEDA] text-[#633806]'

                const certLabel: Record<string, string> = {
                  SOC2_TYPE_I: 'SOC 2 Type I', SOC2_TYPE_II: 'SOC 2 Type II',
                  ISO_27001: 'ISO 27001', ISO_22301: 'ISO 22301', ISO_27701: 'ISO 27701',
                  CYBER_ESSENTIALS: 'Cyber Essentials', CYBER_ESSENTIALS_PLUS: 'Cyber Essentials Plus',
                  PCI_DSS: 'PCI DSS', CSA_STAR: 'CSA STAR', OTHER: 'Other',
                }

                return (
                  <div key={i} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#1A1625]">
                        {certLabel[alert.certType] ?? alert.certType}
                      </p>
                      <p className="text-[12px] text-[#8B85A8] mt-0.5">{alert.vendorName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${badge}`}>
                        {expired ? 'Expired' : days <= 7 ? `${days}d remaining` : days <= 30 ? `${days}d remaining` : `${days}d remaining`}
                      </span>
                      {alert.expiryDate && (
                        <span className="text-[12px] text-[#B8B3CE] whitespace-nowrap">
                          {new Date(alert.expiryDate).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      <Link
                        href={`/assessments/${alert.assessmentId}`}
                        className="text-[12px] text-[#5B3FD4] hover:text-[#3C3489] font-medium whitespace-nowrap"
                      >
                        View assessment →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Due for reassessment ───────────────────────────────────────────── */}
        {dueForReassessment.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E2DFF0] px-6 py-5">
            <h2 className="text-[15px] font-medium text-[#1A1625] mb-4">Due for reassessment</h2>
            <div className="divide-y divide-[#E2DFF0]">
              {dueForReassessment.map((row, i) => {
                const scheduled = new Date(row.scheduledDate)
                const now = new Date()
                const diffDays = Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                const isOverdue = diffDays < 0
                const isUrgent = !isOverdue && diffDays <= 7
                const dateColor = isOverdue ? 'text-[#791F1F]' : isUrgent ? 'text-[#633806]' : 'text-[#1A1625]'

                return (
                  <div key={i} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#1A1625]">{row.vendorName}</p>
                      {row.companiesHouseNumber && (
                        <p className="text-[12px] text-[#8B85A8] mt-0.5">CH: {row.companiesHouseNumber}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[13px] font-medium ${dateColor}`}>
                        {isOverdue
                          ? `Overdue by ${Math.abs(diffDays)}d`
                          : scheduled.toLocaleDateString('en-GB')}
                      </span>
                      <Link
                        href={`/assessments/new?prefill=${encodeURIComponent(row.vendorName)}`}
                        className="px-3 py-1.5 rounded-lg bg-[#5B3FD4] text-white text-[12px] font-medium hover:bg-[#3C3489] transition-colors whitespace-nowrap"
                      >
                        Start reassessment →
                      </Link>
                    </div>
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
