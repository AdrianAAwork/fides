import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'

const ORG_ID_CLAIM = 'https://fides.app/org_id'

export default async function DashboardPage() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login?returnTo=/dashboard')
  }

  const email: string = session.user.email ?? '(no email)'
  const orgId: string = session.user[ORG_ID_CLAIM] ?? '(no org)'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Fides</h1>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/logout"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Dashboard</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Organisation ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{orgId}</dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  )
}
