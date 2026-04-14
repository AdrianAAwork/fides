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

async function checkIasme(orgName: string): Promise<{ meta: ScrapeMeta; certs: TrustCertFound[] }> {
  const url = `https://iasme.co.uk/cyber-essentials/certified-organisations/?search=${encodeURIComponent(orgName)}`
  const result = await safeFetch(url)
  if ('error' in result) {
    return { meta: { attempted: true, found: false, error: result.error }, certs: [] }
  }

  // 403, CAPTCHA, or other blocking response — do not assume certified
  if (result.status === 403 || result.status === 429) {
    return {
      meta: { attempted: true, http_status: result.status, found: false, error: `Blocked (HTTP ${result.status})` },
      certs: [],
    }
  }

  if (result.status !== 200) {
    return {
      meta: { attempted: true, http_status: result.status, found: false, error: null },
      certs: [],
    }
  }

  try {
    const $ = cheerio.load(result.text)

    // Look for the organisation name specifically in result items, not the entire page
    // (the search query itself appears in the input field — don't count that as a match)
    const orgLower = orgName.toLowerCase()

    // Remove the search form from consideration to avoid matching the query echoed in the input
    $('form, input, [type="search"]').remove()

    // Check for CAPTCHA indicators
    const bodyText = $('body').text()
    const lowerBody = bodyText.toLowerCase()
    if (lowerBody.includes('captcha') || lowerBody.includes('verify you are human') || lowerBody.includes('access denied')) {
      return {
        meta: { attempted: true, http_status: result.status, found: false, error: 'Blocked by CAPTCHA or access control' },
        certs: [],
      }
    }

    // Look for org name in result listings (links, headings, list items, table cells)
    const resultSelectors = ['a', 'h1', 'h2', 'h3', 'h4', 'li', 'td', 'th', '.result', '.organisation', '.company']
    let found = false
    for (const sel of resultSelectors) {
      $(sel).each((_, el) => {
        const text = $(el).text().toLowerCase()
        if (text.includes(orgLower)) {
          found = true
        }
      })
      if (found) break
    }

    return {
      meta: { attempted: true, http_status: result.status, found, error: null },
      certs: found ? [{ certType: 'CYBER_ESSENTIALS', source: 'iasme' }] : [],
    }
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
    const [iasmeResult, vantaResult, safebaseResult] = await Promise.all([
      checkIasme(orgName),
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
      ...iasmeResult.certs,
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
      iasmeResult.meta.attempted ||
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
        iasme: iasmeResult.meta,
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
