import * as cheerio from 'cheerio'
import type { TrustPortalsData, ScrapeMeta, TrustCertFound } from './types'

const PORTAL_TIMEOUT_MS = 10_000

const CERT_KEYWORDS = [
  'SOC 2', 'SOC2', 'ISO 27001', 'ISO27001', 'Cyber Essentials Plus',
  'Cyber Essentials', 'ISO 22301', 'ISO22301', 'PCI DSS', 'PCIDSS',
  'certificate', 'audit report', 'trust center', 'trustcenter',
]

async function safeFetch(url: string): Promise<{ status: number; text: string } | { error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PORTAL_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Fides-Risk-Scanner/1.0' },
    })
    const text = await res.text()
    return { status: res.status, text }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function findKeywords(text: string): string[] {
  return CERT_KEYWORDS.filter((kw) => text.toLowerCase().includes(kw.toLowerCase()))
}

function certFromKeyword(kw: string): string {
  if (kw.includes('SOC 2') || kw.includes('SOC2')) return 'SOC2_TYPE_II'
  if (kw.includes('ISO 27001') || kw.includes('ISO27001')) return 'ISO_27001'
  if (kw.includes('Cyber Essentials Plus')) return 'CYBER_ESSENTIALS_PLUS'
  if (kw.includes('Cyber Essentials')) return 'CYBER_ESSENTIALS'
  if (kw.includes('ISO 22301') || kw.includes('ISO22301')) return 'ISO_22301'
  if (kw.includes('PCI DSS') || kw.includes('PCIDSS')) return 'PCI_DSS'
  return 'OTHER'
}

async function checkNcsc(orgName: string): Promise<{ meta: ScrapeMeta; certs: TrustCertFound[] }> {
  const url = `https://www.ncsc.gov.uk/cyberessentials/search?q=${encodeURIComponent(orgName)}`
  const result = await safeFetch(url)
  if ('error' in result) {
    return { meta: { attempted: true, found: false, error: result.error }, certs: [] }
  }

  try {
    let parsed: unknown
    try {
      parsed = JSON.parse(result.text)
    } catch {
      // Not JSON — parse HTML
      const $ = cheerio.load(result.text)
      const found = $('body').text().toLowerCase().includes(orgName.toLowerCase())
      return {
        meta: { attempted: true, http_status: result.status, found, error: null },
        certs: found ? [{ certType: 'CYBER_ESSENTIALS', source: 'ncsc' }] : [],
      }
    }

    const items = Array.isArray((parsed as Record<string, unknown>).results)
      ? (parsed as Record<string, unknown[]>).results
      : []
    const found = items.length > 0
    const certs: TrustCertFound[] = found
      ? items.slice(0, 5).map((item) => {
          const i = item as Record<string, unknown>
          return {
            certType: i.plus ? 'CYBER_ESSENTIALS_PLUS' : 'CYBER_ESSENTIALS',
            source: 'ncsc',
            expiryDate: i.expiry_date as string | undefined,
            issuingBody: i.certification_body as string | undefined,
          }
        })
      : []

    return { meta: { attempted: true, http_status: result.status, found, error: null }, certs }
  } catch (err) {
    return {
      meta: { attempted: true, http_status: result.status, found: false, error: err instanceof Error ? err.message : String(err) },
      certs: [],
    }
  }
}

async function checkVanta(orgName: string): Promise<{ meta: ScrapeMeta; certs: TrustCertFound[] }> {
  const slug = toSlug(orgName)
  const url = `https://trust.vanta.com/${slug}`
  const result = await safeFetch(url)
  if ('error' in result) {
    return { meta: { attempted: true, found: false, error: result.error }, certs: [] }
  }

  if (result.status === 404 || result.status === 403) {
    return { meta: { attempted: true, http_status: result.status, found: false, error: null }, certs: [] }
  }

  try {
    const $ = cheerio.load(result.text)
    const bodyText = $('body').text()
    const keywords = findKeywords(bodyText)
    const found = keywords.length > 0

    const certs: TrustCertFound[] = found
      ? keywords.map((kw) => ({ certType: certFromKeyword(kw), source: 'vanta' }))
      : []

    return {
      meta: { attempted: true, http_status: result.status, found, keywords_found: keywords, error: null },
      certs,
    }
  } catch (err) {
    return {
      meta: { attempted: true, http_status: result.status, found: false, error: err instanceof Error ? err.message : String(err) },
      certs: [],
    }
  }
}

async function checkSafebase(orgName: string): Promise<{ meta: ScrapeMeta; certs: TrustCertFound[] }> {
  const slug = toSlug(orgName)
  const url = `https://${slug}.safebase.io`
  const result = await safeFetch(url)
  if ('error' in result) {
    return { meta: { attempted: true, found: false, error: result.error }, certs: [] }
  }

  if (result.status === 404 || result.status === 403) {
    return {
      meta: { attempted: true, http_status: result.status, found: false, error: `${result.status} not found` },
      certs: [],
    }
  }

  try {
    const $ = cheerio.load(result.text)
    const bodyText = $('body').text()
    const keywords = findKeywords(bodyText)
    const found = keywords.length > 0

    const certs: TrustCertFound[] = found
      ? keywords.map((kw) => ({ certType: certFromKeyword(kw), source: 'safebase' }))
      : []

    return {
      meta: { attempted: true, http_status: result.status, found, keywords_found: keywords, error: null },
      certs,
    }
  } catch (err) {
    return {
      meta: { attempted: true, http_status: result.status, found: false, error: err instanceof Error ? err.message : String(err) },
      certs: [],
    }
  }
}

async function checkVendorSite(website: string): Promise<{ meta: ScrapeMeta; certs: TrustCertFound[] }> {
  const paths = ['/security', '/trust', '/compliance', '/certifications', '/.well-known/security.txt']
  const base = website.replace(/\/$/, '')

  for (const path of paths) {
    const result = await safeFetch(`${base}${path}`)
    if ('error' in result) continue
    if (result.status !== 200) continue

    try {
      const $ = cheerio.load(result.text)
      const bodyText = $('body').text()
      const keywords = findKeywords(bodyText)
      if (keywords.length > 0) {
        return {
          meta: { attempted: true, http_status: result.status, found: true, keywords_found: keywords, error: null },
          certs: keywords.map((kw) => ({ certType: certFromKeyword(kw), source: 'vendor_site' })),
        }
      }
    } catch {
      continue
    }
  }

  return { meta: { attempted: true, found: false, error: null }, certs: [] }
}

export async function fetchTrustPortals(
  orgName: string,
  website?: string
): Promise<TrustPortalsData> {
  try {
    const [ncscResult, vantaResult, safebaseResult] = await Promise.all([
      checkNcsc(orgName),
      checkVanta(orgName),
      checkSafebase(orgName),
    ])

    let vendorResult: { meta: ScrapeMeta; certs: TrustCertFound[] } = {
      meta: { attempted: false, found: false, error: null },
      certs: [],
    }

    if (website) {
      vendorResult = await checkVendorSite(website)
    }

    const allCerts = [
      ...ncscResult.certs,
      ...vantaResult.certs,
      ...safebaseResult.certs,
      ...vendorResult.certs,
    ]

    // Deduplicate by certType
    const seen = new Set<string>()
    const uniqueCerts = allCerts.filter((c) => {
      if (seen.has(c.certType)) return false
      seen.add(c.certType)
      return true
    })

    const anyFound = uniqueCerts.length > 0
    const anyAttempted =
      ncscResult.meta.attempted ||
      vantaResult.meta.attempted ||
      safebaseResult.meta.attempted ||
      vendorResult.meta.attempted

    const status: TrustPortalsData['status'] = anyFound
      ? 'found'
      : anyAttempted
      ? 'inconclusive'
      : 'not_found'

    return {
      certs_found: uniqueCerts,
      status,
      scrape_metadata: {
        ncsc: ncscResult.meta,
        vanta: vantaResult.meta,
        safebase: safebaseResult.meta,
        vendor_site: vendorResult.meta,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:trust-portals] error:', msg)
    return {
      certs_found: [],
      status: 'inconclusive',
      scrape_metadata: {},
      error: msg,
    }
  }
}
