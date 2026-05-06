import type { Metadata } from 'next'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'

export const metadata: Metadata = {
  title: 'Trust & Security · Fides',
  description: 'Fides security posture, infrastructure, data handling, and honest disclosures.',
}

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-[#F4F3F8] px-6 py-12">
      <div className="max-w-[720px] mx-auto">

        <Link href="/" className="inline-block mb-10 text-[12px] text-[#8B85A8] hover:text-[#5B3FD4] transition-colors">
          ← Fides
        </Link>

        <div className="flex flex-col items-center gap-4 mb-12 text-center">
          <FidesSeal size={64} />
          <h1 className="text-[28px] font-medium text-[#1A1625]">Trust & Security</h1>
        </div>

        <div className="space-y-12 text-[15px] leading-relaxed text-[#3D3651]">

          <div className="space-y-4">
            <p>
              Fides is a vendor risk assessment tool built for UK and EU GRC professionals operating
              under DORA, FCA SYSC 8, and equivalent regimes. We take security seriously because our
              buyers do.
            </p>
            <p>This page describes our current security posture honestly — including limitations.</p>
          </div>

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-5">Infrastructure</h2>
            <p className="mb-4">Fides runs on the following providers:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Application hosting:</strong> Vercel</li>
              <li><strong>Database:</strong> Neon Postgres (EU region), encrypted at rest and in transit</li>
              <li><strong>Authentication:</strong> Auth0 (Okta, Inc.), EU tenant</li>
              <li><strong>AI analysis:</strong> Anthropic Claude API, with a hard monthly budget cap</li>
            </ul>
            <p>
              Account data and assessments are stored within the EU. Vendor analysis is performed by
              our AI sub-processor (see{' '}
              <Link href="/legal" className="text-[#5B3FD4] hover:underline">Legal</Link>
              ). Traffic is TLS 1.2 or higher with modern cipher suites. HSTS is configured with the
              preload directive and a two-year max-age.
            </p>
          </section>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-5">Authentication & access control</h2>
            <ul className="list-disc pl-6 space-y-3">
              <li><strong>Session management:</strong> Auth0-issued cookies with secure, HTTP-only, SameSite=Lax flags. Sessions are server-validated on every protected route.</li>
              <li><strong>Email verification required</strong> before any AI-powered feature is enabled.</li>
              <li><strong>Role-based access control:</strong> three tiers (Viewer, Analyst, Admin). All sensitive mutations are gated by role and logged to an audit trail.</li>
              <li><strong>Multi-tenant isolation:</strong> every database query filters by organisation. Users in one organisation cannot enumerate, read, or modify data belonging to another.</li>
              <li><strong>Breached password detection (monitoring mode)</strong> is enabled via Auth0&apos;s HaveIBeenPwned integration. Suspicious IP throttling and brute-force protection are active.</li>
            </ul>
          </section>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-5">Data handling</h2>
            <p className="font-medium text-[#1A1625] mb-3">What we store:</p>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li>Your email address and name (via Auth0)</li>
              <li>Vendor names and assessment data you submit</li>
              <li>Generated reports (your data, attributable to your organisation)</li>
              <li>Audit logs of sensitive actions</li>
            </ul>
            <p className="font-medium text-[#1A1625] mb-3">What we do not store:</p>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li>Payment information (Fides is currently free during beta)</li>
              <li>Documents or files you upload (logo images are the only exception, validated by content type and size)</li>
              <li>Any third-party data beyond what is necessary for the assessment you explicitly request</li>
            </ul>
            <p>
              <strong>Data deletion:</strong> organisation administrators can request full deletion of their
              organisation&apos;s data by emailing{' '}
              <a href="mailto:support@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">support@fidesgrc.uk</a>.
              Deletion is irreversible and occurs within 30 days.
            </p>
          </section>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-5">Pre-launch security verification</h2>
            <p className="mb-4">Before public launch, Fides underwent the following checks:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>A grade on securityheaders.com</strong>{' '}
                (<a
                  href="https://securityheaders.com/?q=https%3A%2F%2Ffidesgrc.uk&followRedirects=on"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5B3FD4] hover:underline"
                >verify</a>)
              </li>
              <li>HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and Content-Security-Policy headers configured</li>
              <li>Read-only code audit of authentication boundaries, multi-tenant isolation, and rate-limiting logic</li>
              <li>File upload validation via magic-byte detection (no client-trusted Content-Type checks)</li>
              <li>Atomic rate-limiting on AI-powered endpoints to prevent abuse</li>
              <li>Independent third-party services (Auth0, Neon, Vercel) handle credential storage; no secrets are committed to source control</li>
            </ul>
          </section>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-5">Honest disclosures</h2>
            <p className="mb-4">In keeping with the spirit of compliance work, we describe our limitations plainly:</p>
            <ul className="list-disc pl-6 space-y-3">
              <li>
                <strong>CSP <code className="font-mono text-[13px]">unsafe-eval</code> and <code className="font-mono text-[13px]">unsafe-inline</code>:</strong>{' '}
                Next.js requires these for hydration. We have prioritised launching over implementing nonce-based CSP,
                which is a more involved change. This is on our post-launch roadmap.
              </li>
              <li>
                <strong>Beta status:</strong> Fides is in beta. AI-generated reports should be reviewed by a qualified
                compliance professional before being relied upon for regulatory decisions. We make no warranty regarding
                accuracy or completeness.
              </li>
              <li>
                <strong>Single-region hosting:</strong> Fides currently runs in a single EU region. If that region is
                unavailable, Fides is unavailable. We do not yet publish an SLA.
              </li>
              <li>
                <strong>No formal certifications:</strong> Fides has no SOC 2, ISO 27001, or equivalent audits. These
                are inappropriate for a single-developer beta product. We will pursue them as the product matures.
              </li>
            </ul>
          </section>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-5">Reporting security issues</h2>
            <p className="mb-4">
              If you discover a security issue in Fides, please email{' '}
              <a href="mailto:security@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">security@fidesgrc.uk</a>{' '}
              with details. We will acknowledge receipt within 48 hours.
            </p>
            <p>
              We do not currently operate a paid bug bounty programme, but we will credit researchers who report
              issues responsibly.
            </p>
          </section>

          <hr className="border-[#E2DFF0]" />

          <p className="text-[13px] text-[#8B85A8] italic">Last updated: 6 May 2026</p>

        </div>
      </div>
    </div>
  )
}
