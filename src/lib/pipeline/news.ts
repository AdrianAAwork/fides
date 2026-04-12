import type { NewsData, HibpData } from './types'

const NEWS_TIMEOUT_MS = 5_000

export async function fetchNews(vendorName: string): Promise<NewsData> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS)
  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(vendorName)}&language=en&sortBy=publishedAt&pageSize=10`
    const res = await fetch(url, {
      headers: { 'X-Api-Key': process.env.NEWS_API_KEY ?? '' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`NewsAPI → ${res.status}`)
    const data = await res.json() as { articles?: Array<{ title?: string; description?: string }> }
    const articles = (data.articles ?? []).map((a) => ({
      title: a.title ?? '',
      description: a.description ?? undefined,
    }))
    return { articles }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:news] error:', msg)
    return { articles: [], error: msg }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchHibp(domain: string): Promise<HibpData> {
  if (process.env.HIBP_ENABLED !== 'true') {
    return { enabled: false, breaches: [] }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(domain)}`,
      {
        headers: { 'hibp-api-key': process.env.HIBP_API_KEY ?? '' },
        signal: controller.signal,
      }
    )
    if (res.status === 404) return { enabled: true, breaches: [] }
    if (!res.ok) throw new Error(`HIBP → ${res.status}`)
    const data = await res.json() as Array<{ Name: string; BreachDate: string; DataClasses?: string[] }>
    return { enabled: true, breaches: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:hibp] error:', msg)
    return { enabled: true, breaches: [], error: msg }
  } finally {
    clearTimeout(timer)
  }
}
