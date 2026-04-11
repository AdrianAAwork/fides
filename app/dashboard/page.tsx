import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { db } from '@/src/db'
import { users, inviteTokens } from '@/src/db/schema'
import { and, count, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { CLAIMS } from '@/src/lib/auth'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
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

  // Check if this user has a pending upgrade invite token
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {org.logoUrl ? (
              <Image
                src={org.logoUrl}
                alt={`${org.name} logo`}
                width={32}
                height={32}
                className="h-8 w-auto object-contain rounded"
              />
            ) : (
              <Link
                href="/settings/organisation"
                title="Add your organisation logo"
                className="h-8 w-8 rounded border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-400 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </Link>
            )}
            <span className="text-xl font-semibold text-gray-900">Fides</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/settings/profile" className="text-sm text-gray-500 hover:text-gray-700">
              {user.displayName}
            </Link>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/logout" className="text-sm text-gray-500 hover:text-gray-700">
              Sign out
            </a>
          </div>
        </div>
      </header>

      {showPendingBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800 text-center">
          Your account is pending activation. The organisation admin has been notified to upgrade their plan.
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                {isSolo ? 'My Workspace' : org.name}
              </h2>
              {!isSolo && (
                <p className="mt-1 text-sm text-gray-500">
                  {memberCount} of {org.memberLimit} members
                </p>
              )}
            </div>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
            >
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Display name</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
            </div>
          </dl>
        </div>

        <div className="flex gap-4">
          {user.role === 'ADMIN' && (
            <Link
              href="/settings/organisation"
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Organisation settings →
            </Link>
          )}
          <Link
            href="/settings/profile"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Profile settings →
          </Link>
        </div>
      </main>
    </div>
  )
}
