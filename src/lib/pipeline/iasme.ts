import type { ScrapeMeta } from './types'

const IASME_SEARCH_URL = 'https://iasme.co.uk/cyber-essentials/certified-organisations/'
const TIMEOUT_MS = 10_000

const BOT_MARKERS = [
  'captcha', 'just a moment', 'verify you are human',
  'checking your browser', 'ddos-guard', 'cloudflare ray id',
]

export async function checkIasmeRegistry(companyName: string): Promise<ScrapeMeta> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = `${IASME_SEARCH_URL}?search=${encodeURIComponent(companyName)}`
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Fides-Compliance-Checker/1.0' },
    })

    // Blocked / rate-limited / server error → inconclusive, not a false positive
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
      return {
        attempted: true,
        http_status: res.status,
        found: false,
        error: 'IASME registry blocked or unavailable — verify manually at iasme.co.uk',
      }
    }

    if (!res.ok) {
      return { attempted: true, http_status: res.status, found: false, error: `HTTP ${res.status}` }
    }

    const text = await res.text()
    const lower = text.toLowerCase()

    // Bot challenge → inconclusive, never a false positive
    if (BOT_MARKERS.some((m) => lower.includes(m))) {
      return {
        attempted: true,
        http_status: res.status,
        found: false,
        error: 'Bot challenge returned — verify manually at iasme.co.uk',
      }
    }

    // Only flag as found if the company name appears in the response body.
    // iasme.co.uk returns the search results inline; if the name is absent, treat as not certified.
    const found = lower.includes(companyName.toLowerCase())

    console.log(`[pipeline:iasme] company="${companyName}" http=${res.status} found=${found}`)
    return { attempted: true, http_status: res.status, found }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('The operation was aborted')
    return {
      attempted: true,
      found: false,
      error: isTimeout
        ? 'Request timed out — verify manually at iasme.co.uk'
        : msg,
    }
  } finally {
    clearTimeout(timer)
  }
}
