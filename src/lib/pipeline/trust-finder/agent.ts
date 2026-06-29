import { safeFetch, classifyFetch, isTrustShaped, detectPlatformFromContent } from './fetch'
import { getPlatformFromUrl, getRung1Urls, getRung2Urls } from './strategies'
import { callHomepageAnalysis, callCertExtraction } from './claude'
import type { TrustFinding, FetchRecord, CertClaimed } from './types'

const MAX_FETCHES = 10
const MAX_MODEL_CALLS = 2
const MAX_VENDOR_MS = 45_000

interface RunState {
  vendor: string
  domain: string
  fetchCount: number
  modelCallCount: number
  startMs: number
  rungsAttempted: string[]
  fetchBuckets: FetchRecord[]
  blockedAtTrustShapedUrl: boolean
  foundUrl: string | null
  foundPlatform: string | null
  foundText: string | null
  blockedUrl: string | null
  blockedPlatform: string | null
  blockedReason: string | null
}

function elapsed(state: RunState): number {
  return Date.now() - state.startMs
}

function hasCapacity(state: RunState): boolean {
  return state.fetchCount < MAX_FETCHES && elapsed(state) < MAX_VENDOR_MS
}

async function tryUrl(
  url: string,
  label: string,
  isTrustShapedUrl: boolean,
  state: RunState
): Promise<'hit' | 'blocked' | 'miss'> {
  if (!hasCapacity(state)) return 'miss'

  state.fetchCount++
  state.rungsAttempted.push(label)

  const result = await safeFetch(url)

  // Redirect detection: catch redirects where a slug-based URL is redirected to
  // the platform root (trust.vanta.com/mypos-limited → trust.vanta.com/) or to a
  // different host. Trailing-slash normalization (trust.mypos.com → trust.mypos.com/)
  // is NOT a real redirect — both URLs refer to the same root resource and must pass.
  if (!('error' in result) && result.finalUrl !== url) {
    try {
      const orig = new URL(url)
      const final = new URL(result.finalUrl)
      // Normalise: treat empty path and '/' as equivalent (trailing-slash redirect)
      const origPath = orig.pathname.replace(/\/$/, '') || '/'
      const finalPath = final.pathname.replace(/\/$/, '') || '/'
      const origHadSlug = origPath !== '/'
      const finalAtRoot = finalPath === '/'
      const slugStripped = origHadSlug && finalAtRoot
      const crossDomain = orig.host !== final.host
      if (crossDomain || slugStripped) {
        console.log(`[trust-finder:agent] redirect ${url} → ${result.finalUrl} — SOFT_404 (${crossDomain ? 'cross-domain' : 'slug stripped'})`)
        state.fetchBuckets.push({ url, bucket: 'SOFT_404', httpStatus: result.status })
        return 'miss'
      }
    } catch {
      // URL parse failed — fall through to normal classification
    }
  }

  const { bucket, httpStatus } = classifyFetch(result, isTrustShapedUrl)

  state.fetchBuckets.push({ url, bucket, httpStatus })

  if (bucket === 'BOT_CHALLENGE' && isTrustShapedUrl) {
    state.blockedAtTrustShapedUrl = true
    if (!state.blockedUrl) {
      state.blockedUrl = url
      state.blockedReason = 'anti-bot protection'
      state.blockedPlatform = getPlatformFromUrl(url)
    }
    return 'blocked'
  }

  if (bucket === 'LOGIN_WALL' && isTrustShapedUrl) {
    const platform = getPlatformFromUrl(url)
    const contentIsTrust = !('error' in result) && isTrustShaped(result.text)
    if (platform || contentIsTrust) {
      state.blockedAtTrustShapedUrl = true
      if (!state.blockedUrl) {
        state.blockedUrl = url
        state.blockedReason = 'access-gated'
        state.blockedPlatform = platform
      }
    }
    return 'blocked'
  }

  if (bucket === 'OK_CONTENT' && !('error' in result)) {
    const platform =
      getPlatformFromUrl(url) ||
      detectPlatformFromContent(result.text) ||
      'vendor_site'
    state.foundUrl = url
    state.foundPlatform = platform
    state.foundText = result.text
    return 'hit'
  }

  return 'miss'
}

function isCanonicalSource(url: string, platform: string | null): boolean {
  if (platform && platform !== 'vendor_site') return true
  return /^https?:\/\/(trust|trustcenter)\./.test(url)
}

function buildWarning(
  stateResult: 'FOUND_AND_READ' | 'FOUND_BUT_UNREADABLE' | 'FOUND_BUT_BLOCKED' | 'NOT_FOUND',
  sourceUrl: string | null,
  blockedReason: string | null,
  sourceTier: 'canonical' | 'fallback' | null
): string {
  if (stateResult === 'FOUND_AND_READ') {
    const fallbackNote =
      sourceTier === 'fallback'
        ? `Note: this is a marketing or documentation page, not a dedicated trust center — ` +
          `a separate trust center may exist elsewhere. `
        : ''
    return (
      fallbackNote +
      `Found trust portal (${sourceTier}) — read certification claims from ${sourceUrl}. ` +
      `Validity dates, audit periods, and scope are not shown publicly and could not be verified — ` +
      `request the actual reports from the vendor and confirm before relying.`
    )
  }
  if (stateResult === 'FOUND_BUT_UNREADABLE') {
    return (
      `Found the vendor's trust page at ${sourceUrl} but could not read its contents ` +
      `(content is likely dynamically rendered and not present in the fetched HTML). ` +
      `Visit the page directly to see their certifications.`
    )
  }
  if (stateResult === 'FOUND_BUT_BLOCKED') {
    return (
      `Found a trust page at ${sourceUrl} but access was blocked/gated ` +
      `(${blockedReason ?? 'blocked'}) — often a positive security-maturity signal. ` +
      `Verify directly.`
    )
  }
  return (
    `No trust page found at common locations. This is not proof none exists — ` +
    `the vendor may host certifications on a custom subdomain or a request-only portal. ` +
    `Verify manually.`
  )
}

function buildFinding(state: RunState, certsClaimed: CertClaimed[]): TrustFinding {
  let resultState: 'FOUND_AND_READ' | 'FOUND_BUT_UNREADABLE' | 'FOUND_BUT_BLOCKED' | 'NOT_FOUND'
  let confidence: 'high' | 'medium' | 'low'
  let sourceUrl: string | null
  let platform: string | null
  let sourceTier: 'canonical' | 'fallback' | null
  let warningBlockedReason: string | null

  if (state.foundUrl && certsClaimed.length > 0) {
    resultState = 'FOUND_AND_READ'
    confidence = 'high'
    sourceUrl = state.foundUrl
    platform = state.foundPlatform
    sourceTier = isCanonicalSource(state.foundUrl, state.foundPlatform) ? 'canonical' : 'fallback'
    warningBlockedReason = null
  } else if (state.foundUrl) {
    resultState = 'FOUND_BUT_UNREADABLE'
    confidence = 'medium'
    sourceUrl = state.foundUrl
    platform = state.foundPlatform
    sourceTier = isCanonicalSource(state.foundUrl, state.foundPlatform) ? 'canonical' : 'fallback'
    warningBlockedReason = null
  } else if (state.blockedUrl) {
    resultState = 'FOUND_BUT_BLOCKED'
    confidence = 'medium'
    sourceUrl = state.blockedUrl
    platform = state.blockedPlatform ?? null
    sourceTier = isCanonicalSource(state.blockedUrl, state.blockedPlatform ?? null) ? 'canonical' : 'fallback'
    warningBlockedReason = state.blockedReason
  } else {
    resultState = 'NOT_FOUND'
    confidence = 'low'
    sourceUrl = null
    platform = null
    sourceTier = null
    warningBlockedReason = null
  }

  return {
    vendor: state.vendor,
    domain: state.domain,
    state: resultState,
    confidence,
    sourceUrl,
    sourceTier,
    platform,
    certsClaimed: resultState === 'FOUND_AND_READ' ? certsClaimed : [],
    warning: buildWarning(resultState, sourceUrl, warningBlockedReason, sourceTier),
    trace: {
      rungsAttempted: state.rungsAttempted,
      fetchBuckets: state.fetchBuckets,
      modelCalls: state.modelCallCount,
      elapsedMs: elapsed(state),
      blockedAtTrustShapedUrl: resultState !== 'NOT_FOUND' && state.blockedAtTrustShapedUrl,
    },
  }
}

export async function findTrust(vendor: string, domain: string): Promise<TrustFinding> {
  // No domain → refuse to fabricate. A name-slug like "trust.vanta.com/mypos-limited"
  // can return HTTP 200 from the platform's own homepage and produce a confident wrong
  // finding. That is strictly worse than an honest NOT_FOUND.
  if (!domain) {
    console.log(`[trust-finder:agent] no domain for "${vendor}" — skipping all rungs, returning NOT_FOUND`)
    return {
      vendor, domain,
      state: 'NOT_FOUND',
      confidence: 'low',
      sourceUrl: null,
      sourceTier: null,
      platform: null,
      certsClaimed: [],
      warning: 'No vendor domain was available, so no trust portal could be checked. Provide the vendor\'s website to enable trust-portal discovery.',
      trace: { rungsAttempted: ['no-domain:skipped'], fetchBuckets: [], modelCalls: 0, elapsedMs: 0, blockedAtTrustShapedUrl: false },
    }
  }

  const state: RunState = {
    vendor,
    domain,
    fetchCount: 0,
    modelCallCount: 0,
    startMs: Date.now(),
    rungsAttempted: [],
    fetchBuckets: [],
    blockedAtTrustShapedUrl: false,
    foundUrl: null,
    foundPlatform: null,
    foundText: null,
    blockedUrl: null,
    blockedPlatform: null,
    blockedReason: null,
  }

  try {
    // Rung 1 — URL pattern guessing (no model call)
    for (const { url, label } of getRung1Urls(domain)) {
      if (!hasCapacity(state)) break
      const outcome = await tryUrl(url, label, true, state)
      if (outcome === 'hit') break
    }

    // Rung 2 — Known-platform slug URLs (no model call).
    // These URLs are derived from the vendor name, not the domain, so they must
    // only run when we have a real domain to anchor the company identity. The empty-
    // domain guard above already prevents reaching this point without a domain, but
    // the explicit check here makes the invariant local and obvious.
    if (!state.foundUrl && domain) {
      for (const { url, label } of getRung2Urls(domain, vendor)) {
        if (!hasCapacity(state)) break
        const outcome = await tryUrl(url, label, true, state)
        if (outcome === 'hit') break
      }
    }

    // Rung 3 — Homepage analysis (first model call)
    if (!state.foundUrl && state.modelCallCount < MAX_MODEL_CALLS && hasCapacity(state)) {
      const homeUrl = `https://${domain}`
      state.fetchCount++
      state.rungsAttempted.push('rung3:homepage-fetch')

      const homeResult = await safeFetch(homeUrl)
      const { bucket, httpStatus } = classifyFetch(homeResult, false)
      state.fetchBuckets.push({ url: homeUrl, bucket, httpStatus })

      if (!('error' in homeResult) && homeResult.status === 200) {
        state.modelCallCount++
        state.rungsAttempted.push('rung3:model-homepage-analysis')

        const candidates = await callHomepageAnalysis(homeResult.text, domain)

        for (const candidateUrl of candidates) {
          if (!hasCapacity(state)) break
          const outcome = await tryUrl(candidateUrl, `rung3:candidate:${candidateUrl}`, true, state)
          if (outcome === 'hit') break
        }
      }
    }

    // Rung 5 — Cert extraction from found page (second model call)
    let certsClaimed: CertClaimed[] = []
    if (state.foundText && state.modelCallCount < MAX_MODEL_CALLS && hasCapacity(state)) {
      state.modelCallCount++
      state.rungsAttempted.push('rung5:cert-extraction')
      certsClaimed = await callCertExtraction(state.foundText)
    }

    // vendor_site with no certs → NOT_FOUND (not FOUND_BUT_UNREADABLE)
    if (state.foundPlatform === 'vendor_site' && certsClaimed.length === 0) {
      state.foundUrl = null
      state.foundText = null
      state.foundPlatform = null
    }

    return buildFinding(state, certsClaimed)
  } catch (err) {
    console.error('[trust-finder:agent] unexpected error for', vendor, ':', err)
    return buildFinding(state, [])
  }
}
