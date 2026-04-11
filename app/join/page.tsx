// This page is only ever rendered for users who are already members
// (needs_onboarding: false). New users are intercepted by middleware and
// redirected to /onboarding?mode=join&token=xxx before reaching here.
import Link from 'next/link'

export default function JoinPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">
          You&apos;re already a member
        </h1>
        <p className="text-sm text-gray-500">
          Your account is already linked to an organisation. Each account can only belong to one organisation.
        </p>
        <Link
          href="/dashboard"
          className="inline-block py-2 px-6 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
