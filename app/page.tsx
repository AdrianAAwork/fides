import FidesSeal from '@/src/components/FidesSeal'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F3F8] px-4">
      <div className="w-full max-w-[400px] space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <FidesSeal size={80} />
          <h1 className="text-[24px] font-medium text-[#1A1625]">Fides</h1>
          <p className="text-[13px] text-[#8B85A8]">Vendor Risk Assessment</p>
        </div>

        <div className="space-y-4 pt-2">
          <p className="text-[13px] text-[#8B85A8]">Access or create your organisation account</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="/api/auth/login?returnTo=/dashboard"
              className="flex-1 flex justify-center py-3 px-4 rounded-lg bg-[#5B3FD4] text-white text-[13px] font-medium hover:bg-[#3C3489] transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:ring-offset-2"
            >
              Sign in
            </a>
            <a
              href="/api/auth/login?screen_hint=signup&returnTo=/dashboard"
              className="flex-1 flex justify-center py-3 px-4 rounded-lg border border-[#5B3FD4] text-[#5B3FD4] bg-transparent text-[13px] font-medium hover:bg-[#5B3FD4]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#5B3FD4] focus:ring-offset-2"
            >
              Sign up
            </a>
          </div>
        </div>

        <p className="text-[11px] text-[#B8B3CE]">
          Powered by Anthropic · Companies House · GLEIF
        </p>
      </div>
    </div>
  )
}
