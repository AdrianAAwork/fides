import type { NewsData, HibpData } from './types'

const NEWS_TIMEOUT_MS = 5_000

/** Strip common legal suffixes so "Acme Technologies PLC" → "Acme Technologies" */
function simplifyCompanyName(name: string): string {
  return name
    .replace(/\b(PLC|LTD|LIMITED|LLP|LLC|INC|CORP|CORPORATION|GROUP|HOLDINGS|INTERNATIONAL|UK|INTERNATIONAL)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function fetchNewsForQuery(query: string, apiKey: string, signal: AbortSignal): Promise<Array<{ title?: string; description?: string }>> {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10`
  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey },
    signal,
  })
  if (!res.ok) throw new Error(`NewsAPI → ${res.status}`)
  const data = await res.json() as { articles?: Array<{ title?: string; description?: string }> }
  return data.articles ?? []
}

export async function fetchNews(vendorName: string): Promise<NewsData> {
  const apiKey = process.env.NEWS_API_KEY ?? ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS)

  try {
    const simplified = simplifyCompanyName(vendorName)
    const useSimplified = simplified.length > 0 && simplified.toLowerCase() !== vendorName.toLowerCase()

    let rawArticles: Array<{ title?: string; description?: string }>
    let queryNote: string | undefined

    if (useSimplified) {
      // Run both queries in parallel and merge, deduplicating by title
      const [fullResults, simplifiedResults] = await Promise.allSettled([
        fetchNewsForQuery(vendorName, apiKey, controller.signal),
        fetchNewsForQuery(simplified, apiKey, controller.signal),
      ])

      const seenTitles = new Set<string>()
      rawArticles = []

      const addArticles = (articles: Array<{ title?: string; description?: string }>) => {
        for (const a of articles) {
          const key = (a.title ?? '').toLowerCase()
          if (!seenTitles.has(key)) {
            seenTitles.add(key)
            rawArticles.push(a)
          }
        }
      }

      if (fullResults.status === 'fulfilled') addArticles(fullResults.value)
      if (simplifiedResults.status === 'fulfilled') addArticles(simplifiedResults.value)

      const fullCount = fullResults.status === 'fulfilled' ? fullResults.value.length : 0
      const simplifiedCount = simplifiedResults.status === 'fulfilled' ? simplifiedResults.value.length : 0

      if (simplifiedCount > fullCount) {
        queryNote = `More results found using simplified name "${simplified}" — results merged.`
      }
    } else {
      rawArticles = await fetchNewsForQuery(vendorName, apiKey, controller.signal)
    }

    const articles = rawArticles.map((a) => ({
      title: a.title ?? '',
      description: a.description ?? undefined,
    }))

    return {
      articles,
      articlesCount: articles.length,
      queryNote,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:news] error:', msg)
    return { articles: [], articlesCount: 0, error: msg }
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
