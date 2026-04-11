import { redirect } from 'next/navigation'
import { db } from '@/src/db'
import { users } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import OrgSettings from './OrgSettings'

export default async function OrganisationSettingsPage() {
  const ctx = await getDbContext()
  if (!ctx) {
    redirect('/api/auth/login?returnTo=/settings/organisation')
  }

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center space-y-3">
          <h1 className="text-lg font-semibold text-gray-900">Access denied</h1>
          <p className="text-sm text-gray-500">
            You do not have permission to access this page.
          </p>
        </div>
      </div>
    )
  }

  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.orgId, ctx.org.id), isNull(users.deletedAt)))
    .orderBy(users.createdAt)

  return <OrgSettings org={ctx.org} currentUserId={ctx.user.id} initialMembers={members} />
}
