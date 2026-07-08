import type { SafeFetchResult, FetchBucket } from './types'

const FETCH_TIMEOUT_MS = 10_000

const TRUST_STRUCTURAL_PHRASES = [
  'trust center', 'trustcenter', 'security certifications',
  'compliance certifications', 'audit reports',
]

const TRUST_CERT_KEYWORDS = [
  'soc 1', 'soc1', 'soc 2', 'soc2', 'soc 3', 'soc3',
  'iso 27001', 'iso27001', 'iso 27017', 'iso27017', 'iso 27018', 'iso27018',
  'iso 27701', 'iso27701', 'iso 22301', 'iso22301',
  'pci dss', 'pcidss', 'pci 3ds', 'pci pin', 'pa-dss',
  'cyber essentials', 'csa star', 'nist csf',
  'fedramp', 'hipaa', 'tisax', 'emvco',
]

const PLATFORM_FINGERPRINTS = [
  'powered by safebase', 'built on safebase', 'app.safebase.io', 'cdn.safebase.io',
  'vanta trust', 'powered by drata', 'drata.com/trust',
  'whistic.com', 'conveyor.security', 'trustpage.com',
]

const BOT_CHALLENGE_MARKERS = [
  'just a moment', 'attention required', 'verify you are human',
  'checking your browser', 'ddos-guard', 'cf-browser-verification',
  'security check to access', 'enable javascript and cookies',
]

const SOFT_404_MARKERS = [
  "page not found", "page couldn't be found", 'the page you',
  '404 error', 'error 404', "we can't find",
]

const LOGIN_WALL_MARKERS = [
  'request access', 'get access', 'login required',
  'log in to view', 'sign in to access', 'you must be logged in',
]

const PROFILE_PAGE_MARKERS = [
  'block or report',
  'contribution graph',
  'contributions in the last',
]

const DISCLOSURE_PAGE_MARKERS = [
  'bug bounty',
  'report a vulnerability',
  'submit a vulnerability',
  'report a security issue',
  'responsible disclosure',
  'hall of fame',
  'safe harbor',
]

export async function safeFetch(url: string): Promise<SafeFetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Fides-Trust-Finder/1.0' },
    })
    const text = await res.text()
    return { status: res.status, text, finalUrl: res.url }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

export function isTrustShaped(text: string): boolean {
  const lower = text.toLowerCase()

  if (PROFILE_PAGE_MARKERS.some((m) => lower.includes(m))) return false
  if (lower.includes('followers') && lower.includes('following')) return false

  if (PLATFORM_FINGERPRINTS.some((fp) => lower.includes(fp))) return true

  const hasStructuralPhrase = TRUST_STRUCTURAL_PHRASES.some((p) => lower.includes(p))
  let certMatches = 0
  for (const kw of TRUST_CERT_KEYWORDS) {
    if (lower.includes(kw)) certMatches++
  }

  if (DISCLOSURE_PAGE_MARKERS.some((m) => lower.includes(m))) {
    const disclosureCount = DISCLOSURE_PAGE_MARKERS.filter((m) => lower.includes(m)).length
    if (disclosureCount >= 3) return certMatches >= 5
    return certMatches >= 3 || (hasStructuralPhrase && certMatches >= 2)
  }

  return hasStructuralPhrase || certMatches >= 2
}

export function detectPlatformFromContent(text: string): string | null {
  const lower = text.toLowerCase()
  if (lower.includes('safebase')) return 'safebase'
  if (lower.includes('vanta') && (lower.includes('trust') || lower.includes('security program')))
    return 'vanta'
  if (lower.includes('drata')) return 'drata'
  if (lower.includes('whistic')) return 'whistic'
  if (lower.includes('conveyor')) return 'conveyor'
  if (lower.includes('trustpage')) return 'trustpage'
  return null
}

export function classifyFetch(
  result: SafeFetchResult,
  isTrustShapedUrl: boolean
): { bucket: FetchBucket; httpStatus: number | null } {
  if ('error' in result) {
    return { bucket: 'TRANSIENT', httpStatus: null }
  }

  const { status, text } = result
  const lower = text.toLowerCase()

  const hasBotMarker = BOT_CHALLENGE_MARKERS.some((m) => lower.includes(m))

  if (status === 403 || status === 401 || status === 503) {
    if (hasBotMarker) return { bucket: 'BOT_CHALLENGE', httpStatus: status }
    if (status === 403 && isTrustShapedUrl) return { bucket: 'BOT_CHALLENGE', httpStatus: status }
    return { bucket: 'TRANSIENT', httpStatus: status }
  }

  if (status === 429 || status >= 500) {
    return { bucket: 'TRANSIENT', httpStatus: status }
  }

  if (hasBotMarker) {
    return { bucket: 'BOT_CHALLENGE', httpStatus: status }
  }

  if (status === 404) {
    return { bucket: 'SOFT_404', httpStatus: status }
  }

  if (status !== 200) {
    return { bucket: 'TRANSIENT', httpStatus: status }
  }

  if (isTrustShaped(text)) {
    return { bucket: 'OK_CONTENT', httpStatus: 200 }
  }

  if (SOFT_404_MARKERS.some((m) => lower.includes(m))) {
    return { bucket: 'SOFT_404', httpStatus: 200 }
  }

  if (LOGIN_WALL_MARKERS.some((m) => lower.includes(m))) {
    return { bucket: 'LOGIN_WALL', httpStatus: 200 }
  }

  if ((lower.includes('/login') || lower.includes('/signin')) && text.length < 2000) {
    return { bucket: 'SOFT_404', httpStatus: 200 }
  }

  return { bucket: 'SOFT_404', httpStatus: 200 }
}
