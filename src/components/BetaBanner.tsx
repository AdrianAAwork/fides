'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

// Banner shows on these routes. When adding new authenticated routes, add the prefix here.
const APP_PREFIXES = ['/dashboard', '/assessments', '/settings', '/onboarding']

export default function BetaBanner() {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)
  const show = !dismissed && APP_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/')
  )
  if (!show) return null
  return (
    <div role="status" className="bg-[#FFF8E1] border-b border-[#F0E0A0] px-4 py-2 flex items-center justify-between gap-4">
      <p className="text-[12px] text-[#8B5A00] flex-1">
        Fides is in beta. Reports are AI-generated and should be reviewed by a qualified compliance
        professional before being relied upon for regulatory decisions.
      </p>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss beta notice"
        className="flex-shrink-0 text-[#8B5A00] hover:text-[#6B4423] text-[16px] leading-none transition-colors">
        ×
      </button>
    </div>
  )
}
