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

  function buildCertList(certs: typeof finding.certsClaimed): TrustCertFound[] {
    // Deduplicate by original certType (not enumType) so PCI_PIN and PCI_3DS
    // both survive even though both map to 'OTHER' in the DB enum.
    const seen = new Set<string>()
    const out: TrustCertFound[] = []
    for (const c of certs) {
      if (seen.has(c.certType)) continue
      seen.add(c.certType)
      const enumType = CERT_TYPE_ENUM.has(c.certType) ? c.certType : 'OTHER'
      out.push({
        certType: enumType,
        source: finding.platform ?? 'trust-finder',
        issuingBody: c.auditor ?? undefined,
        sourceUrl: finding.sourceUrl ?? undefined,
        notes: enumType === 'OTHER' ? c.rawLabel : undefined,
        category: c.category,
      })
    }
    return out
  }

  // certs_found = security_cert only → used for scoring (unchanged)
  const certs_found = buildCertList(
    finding.certsClaimed.filter((c) => c.category === 'security_cert')
  )

  // frameworks_found = privacy_framework + other → display only, persisted to DB but not scored
  const frameworks_found = buildCertList(
    finding.certsClaimed.filter((c) => c.category !== 'security_cert')
  )

  return {
    certs_found,
    frameworks_found,
    status,
    scrape_metadata: {
      agent: {
        state: finding.state,
        confidence: finding.confidence,
        sourceUrl: finding.sourceUrl,
        sourceTier: finding.sourceTier,
        platform: finding.platform,
        warning: finding.warning,
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
