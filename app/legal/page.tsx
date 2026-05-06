import type { Metadata } from 'next'
import Link from 'next/link'
import FidesSeal from '@/src/components/FidesSeal'

export const metadata: Metadata = {
  title: 'Legal · Fides',
  description: 'Terms of Service and Privacy Policy for Fides.',
}

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[#F4F3F8] px-6 py-12">
      <div className="max-w-[720px] mx-auto">

        <Link href="/" className="inline-block mb-10 text-[12px] text-[#8B85A8] hover:text-[#5B3FD4] transition-colors">
          ← Fides
        </Link>

        <div className="flex flex-col items-center gap-4 mb-12 text-center">
          <FidesSeal size={64} />
          <h1 className="text-[28px] font-medium text-[#1A1625]">Legal</h1>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-[#3D3651]">

          <p>
            This page contains the Terms of Service and Privacy Policy for Fides (fidesgrc.uk). It
            is written to be readable. If you have questions, email{' '}
            <a href="mailto:support@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">support@fidesgrc.uk</a>.
          </p>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-8">Terms of Service</h2>
            <div className="space-y-8">

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Who provides this service</h3>
                <p>
                  Fides is provided by Adrian Stefanov, a sole trader based in the United Kingdom
                  (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By using fidesgrc.uk and any of its
                  sub-domains or interfaces (collectively, the &ldquo;Service&rdquo;), you
                  (&ldquo;you&rdquo;, &ldquo;your&rdquo;) agree to these terms.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">What Fides is</h3>
                <p>
                  Fides is a vendor risk assessment tool currently in beta. It generates analyses
                  using AI and publicly available data sources, including Companies House and GLEIF.
                  Generated outputs are intended as decision support, not as authoritative compliance
                  determinations.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Beta status and no warranty</h3>
                <p className="mb-4">
                  Fides is provided &ldquo;as is&rdquo; with no warranties of any kind, express or implied,
                  including but not limited to warranties of merchantability, fitness for a particular
                  purpose, or non-infringement.
                </p>
                <p className="mb-3">You acknowledge that:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>AI-generated analyses may contain inaccuracies, omissions, or outdated information</li>
                  <li>Compliance, regulatory, and risk decisions remain entirely your responsibility</li>
                  <li>You should not rely on Fides as the sole basis for any legal, regulatory, or contractual decision</li>
                </ul>
                <p>A qualified compliance professional should review any output before it is relied upon.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Acceptable use</h3>
                <p className="mb-3">You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Submit content that is unlawful, infringing, defamatory, or violates any third party&apos;s rights</li>
                  <li>Submit personal data of individuals without a lawful basis to do so</li>
                  <li>Attempt to reverse-engineer, scrape, or interfere with the Service</li>
                  <li>Use the Service to violate sanctions, export controls, or any applicable law</li>
                </ul>
                <p>We reserve the right to suspend or terminate any account that violates these terms, with or without notice.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Your content</h3>
                <p className="mb-4">
                  You retain all rights to data and content you submit (&ldquo;Your Content&rdquo;). You grant
                  us a limited licence to process Your Content solely to provide the Service to you —
                  for example, sending it to our AI sub-processor for analysis, or storing it in your
                  organisation&apos;s account.
                </p>
                <p>We do not use Your Content to train AI models. We do not sell Your Content to third parties.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Limitation of liability</h3>
                <p className="mb-4">
                  To the fullest extent permitted by law, our total aggregate liability to you arising
                  from or related to the Service is limited to £100. We are not liable for indirect,
                  incidental, consequential, or punitive damages of any kind.
                </p>
                <p>
                  This section does not limit liability that cannot be limited under applicable law
                  (including liability for death, personal injury caused by negligence, or fraud).
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Termination</h3>
                <p className="mb-4">
                  You may stop using the Service at any time. We may discontinue the Service, in whole
                  or in part, at any time during the beta period without notice or liability.
                </p>
                <p>
                  If you wish to delete your account and associated data, email{' '}
                  <a href="mailto:support@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">support@fidesgrc.uk</a>.
                  See the Privacy Policy below for details.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Governing law</h3>
                <p>These terms are governed by the laws of England and Wales. Any disputes will be resolved in the courts of England and Wales.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Changes to these terms</h3>
                <p>We may update these terms during the beta. Continued use of the Service after a change constitutes acceptance. Material changes will be notified via email to registered users.</p>
              </div>

            </div>
          </section>

          <hr className="border-[#E2DFF0]" />

          <section>
            <h2 className="text-[18px] font-medium text-[#1A1625] mb-8">Privacy Policy</h2>
            <div className="space-y-8">

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Data controller</h3>
                <p>
                  For the purposes of UK GDPR, the data controller for personal data collected through
                  Fides is Adrian Stefanov, sole trader, United Kingdom. You can contact us at{' '}
                  <a href="mailto:support@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">support@fidesgrc.uk</a>{' '}
                  for any privacy matter.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">What personal data we collect</h3>
                <p className="mb-3">When you create an account:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Name (provided by you, or by your identity provider if signing in with Google)</li>
                  <li>Email address</li>
                  <li>A unique identifier provided by Auth0</li>
                </ul>
                <p className="mb-3">When you use the Service:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Vendor names and assessment data you submit</li>
                  <li>Generated reports (linked to your organisation)</li>
                  <li>Audit log entries for sensitive actions (e.g., role changes, invitations sent)</li>
                  <li>Standard server-side logs (IP address, timestamps, user agent) retained for security and operational purposes</li>
                </ul>
                <p>We do not knowingly collect data from anyone under 18.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Why we process your data</h3>
                <p className="mb-3">We process personal data on the following lawful bases under UK GDPR:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Performance of a contract:</strong> to provide the Service to you and send you operational emails such as verification messages</li>
                  <li><strong>Legitimate interests:</strong> to authenticate you and prevent abuse of the Service</li>
                  <li><strong>Legal obligation:</strong> where applicable law requires us to retain or process certain data</li>
                </ul>
                <p>We do not currently engage in marketing, profiling, or automated decision-making with legal or significant effects on individuals.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Sub-processors</h3>
                <p className="mb-3">
                  We use the following sub-processors to provide the Service. Each is contractually
                  obligated to handle your data in accordance with applicable data protection law.
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Vercel Inc.</strong> — application hosting (global edge network)</li>
                  <li><strong>Neon Inc.</strong> — database hosting</li>
                  <li><strong>Auth0 (Okta, Inc.)</strong> — authentication, EU region</li>
                  <li><strong>Anthropic, PBC</strong> — AI analysis via the Claude API, United States</li>
                  <li><strong>Cloudflare, Inc.</strong> — DNS, CDN, and inbound email routing</li>
                </ul>
                <p>
                  Where data is transferred outside the UK or EEA (notably to Anthropic in the United
                  States), we rely on Standard Contractual Clauses or equivalent appropriate safeguards
                  published by these providers.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">How long we keep your data</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Account data: until you delete your account, plus up to 30 days for backup retention</li>
                  <li>Audit logs: while your account is active</li>
                  <li>Generated reports: until you or your organisation deletes them, or the account is deleted</li>
                  <li>Server-side logs: per our hosting providers&apos; default policies</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Your rights</h3>
                <p className="mb-3">Under UK GDPR you have the right to:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate data</li>
                  <li>Delete your data (&ldquo;right to erasure&rdquo;)</li>
                  <li>Restrict or object to processing</li>
                  <li>Receive your data in a portable format</li>
                  <li>Withdraw consent at any time (where processing is based on consent)</li>
                  <li>
                    Lodge a complaint with the Information Commissioner&apos;s Office (ICO) at{' '}
                    <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#5B3FD4] hover:underline">ico.org.uk</a>
                  </li>
                </ul>
                <p>
                  To exercise any of these rights, email{' '}
                  <a href="mailto:support@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">support@fidesgrc.uk</a>.
                  We will respond within 30 days.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Data deletion</h3>
                <p className="mb-4">
                  To request deletion of your account and associated organisation data, email{' '}
                  <a href="mailto:support@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">support@fidesgrc.uk</a>{' '}
                  from the email address associated with your account. We will confirm and complete
                  deletion within 30 days. Deletion is irreversible.
                </p>
                <p>Some data may be retained after deletion where we have a legal obligation to do so.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Cookies</h3>
                <p className="mb-3">Fides uses essential cookies only:</p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>A session cookie set by Auth0 to keep you signed in</li>
                  <li>A small set of operational cookies set by Vercel and Cloudflare for routing and security purposes</li>
                </ul>
                <p>We do not use marketing, advertising, or analytics cookies that track you across sites.</p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Security</h3>
                <p>
                  We describe our security posture on the{' '}
                  <Link href="/trust" className="text-[#5B3FD4] hover:underline">Trust & Security</Link>{' '}
                  page. To report a security issue, email{' '}
                  <a href="mailto:security@fidesgrc.uk" className="text-[#5B3FD4] hover:underline">security@fidesgrc.uk</a>.
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[#1A1625] mb-3">Changes to this policy</h3>
                <p>
                  We may update this policy as Fides evolves. Material changes will be notified via
                  email and reflected in the &ldquo;last updated&rdquo; date below.
                </p>
              </div>

            </div>
          </section>

          <hr className="border-[#E2DFF0]" />

          <p className="text-[13px] text-[#8B85A8] italic">Last updated: 7 May 2026</p>

        </div>
      </div>
    </div>
  )
}
