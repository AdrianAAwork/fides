import { findTrust } from './agent'
import type { TrustFinding } from './types'
import type { TrustPortalsData, TrustCertFound } from '../types'

// The certTypeType Postgres enum. Any agent cert not in this set maps to OTHER.
const CERT_TYPE_ENUM = new Set([
  'SOC2_TYPE_I', 'SOC2_TYPE_II', 'ISO_27001', 'ISO_22301', 'ISO_27701',
  'CYBER_ESSENTIALS', 'CYBER_ESSENTIALS_PLUS', 'PCI_DSS', 'CSA_STAR', 'OTHER',
])

export function adaptFindingToTrustPortals(finding: TrustFinding): TrustPortalsData {
  const status: TrustPortalsData['status'] =
    finding.state === 'FOUND_AND_READ'
      ? 'found'
      : finding.state === 'NOT_FOUND'
      ? 'not_found'
      : 'inconclusive'

  // Only security_certs go into certs_found. Privacy frameworks stay in the agent blob.
  const securityCerts = finding.certsClaimed.filter((c) => c.category === 'security_cert')

  // Deduplicate by certType (first occurrence wins)
  const seen = new Set<string>()
  const certs_found: TrustCertFound[] = []
  for (const c of securityCerts) {
    const enumType = CERT_TYPE_ENUM.has(c.certType) ? c.certType : 'OTHER'
    if (seen.has(enumType)) continue
    seen.add(enumType)
    certs_found.push({
      certType: enumType,
      source: finding.platform ?? 'trust-finder',
      // expiryDate: never populated — agent has no verified dates
      issuingBody: c.auditor ?? undefined,
      sourceUrl: finding.sourceUrl ?? undefined,
      notes: enumType === 'OTHER' ? c.rawLabel : undefined,
    })
  }

  const privacyFrameworks = finding.certsClaimed
    .filter((c) => c.category === 'privacy_framework')
    .map((c) => ({ certType: c.certType, rawLabel: c.rawLabel }))

  return {
    certs_found,
    status,
    scrape_metadata: {
      agent: {
        state: finding.state,
        confidence: finding.confidence,
        sourceUrl: finding.sourceUrl,
        sourceTier: finding.sourceTier,
        platform: finding.platform,
        warning: finding.warning,
        privacy_frameworks: privacyFrameworks,
        trace: finding.trace,
      },
    },
  }
}

// The swap point. Today: runs the agent inline.
// Later (AWS era): the body becomes an HTTP call — nothing else in Fides changes.
export async function findTrustPortal(
  vendorName: string,
  domain: string
): Promise<TrustFinding> {
  return findTrust(vendorName, domain)
}
