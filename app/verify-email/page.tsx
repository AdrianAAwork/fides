import { getSession } from '@auth0/nextjs-auth0'
import FidesSeal from '@/src/components/FidesSeal'
import ResendButton from './ResendButton'

export default async function VerifyEmailPage() {
  const session = await getSession()
  const email = session?.user?.email ?? 'your email address'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F3F8] px-4">
      <div className="w-full max-w-[400px] space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <FidesSeal size={80} />
          <h1 className="text-[24px] font-medium text-[#1A1625]">Verify your email</h1>
        </div>

        <p className="text-[13px] text-[#8B85A8]">
          We&apos;ve sent a verification email to{' '}
          <span className="font-medium text-[#1A1625]">{email}</span>.
          Click the link in that email to access your dashboard.
        </p>

        <div className="space-y-3">
          <ResendButton />

          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/login?returnTo=/dashboard"
            className="w-full flex justify-center py-3 px-4 rounded-lg border border-[#5B3FD4] text-[#5B3FD4] bg-transparent text-[13px] font-medium hover:bg-[#5B3FD4]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:ring-offset-2"
          >
            I&apos;ve verified — refresh my session
          </a>

          <p className="text-[11px] text-[#B8B3CE]">
            If you&apos;ve just clicked the verification link in your email, try heading to your
            dashboard directly — you may not need to refresh.
          </p>
        </div>

        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/logout?returnTo=/"
          className="block text-[12px] text-[#8B85A8] hover:text-[#5B3FD4] transition-colors"
        >
          Or sign in with a different email
        </a>

        <p className="text-[11px] text-[#B8B3CE]">
          Powered by Anthropic · Companies House · GLEIF
        </p>
      </div>
    </div>
  )
}
