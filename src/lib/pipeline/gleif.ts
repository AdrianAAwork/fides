import type { GleifData } from './types'

const BASE_URL = 'https://api.gleif.org/api/v1'
const TIMEOUT_MS = 8_000

async function gleifFetch(path: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`GLEIF ${path} → ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchGleif(vendorName: string): Promise<GleifData> {
  try {
    const searchRes = await gleifFetch(
      `/fuzzycompanyquery?q=${encodeURIComponent(vendorName)}&page[size]=5`
    )
    const data = searchRes as { data?: Array<{ attributes?: Record<string, unknown>; relationships?: Record<string, unknown> }> }
    const first = data.data?.[0]
    if (!first) return {}

    const attrs = first.attributes as Record<string, unknown> | undefined
    const lei = attrs?.lei as string | undefined
    const entity = attrs?.entity as Record<string, unknown> | undefined
    const legalName = (entity?.legalName as Record<string, unknown>)?.name as string | undefined
    const jurisdiction = entity?.jurisdiction as string | undefined
    const category = entity?.category as string | undefined
    const status = entity?.status as string | undefined
    const registeredAs = entity?.registeredAs as string | undefined

    let ultimateParent: GleifData['ultimateParent'] | undefined
    if (lei) {
      try {
        const leiRes = await gleifFetch(`/lei-records/${lei}`)
        const leiData = leiRes as { data?: { relationships?: Record<string, unknown> } }
        const rels = leiData.data?.relationships
        const parentLink = rels?.['ultimate-parent'] as Record<string, unknown> | undefined
        const parentLei = (parentLink?.data as Record<string, unknown>)?.id as string | undefined
        if (parentLei && parentLei !== lei) {
          const parentRes = await gleifFetch(`/lei-records/${parentLei}`)
          const parentData = parentRes as { data?: { attributes?: Record<string, unknown> } }
          const parentEntity = parentData.data?.attributes?.entity as Record<string, unknown> | undefined
          const parentName = (parentEntity?.legalName as Record<string, unknown>)?.name as string | undefined
          ultimateParent = { lei: parentLei, name: parentName }
        }
      } catch {
        // parent lookup is best-effort
      }
    }

    return { lei, legalName, jurisdiction, category, status, registeredAs, ultimateParent }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:gleif] error:', msg)
    return { error: msg }
  }
}
