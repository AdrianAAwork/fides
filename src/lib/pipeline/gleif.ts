import type { GleifData } from './types'

const BASE_URL = 'https://api.gleif.org/api/v1'
const TIMEOUT_MS = 8_000

async function gleifFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`
  console.log('[pipeline:gleif] GET', url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
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
    // Step 1 — fuzzy name search via autocompletions (fuzzycompanyquery was removed)
    const searchPath = `/autocompletions?field=fulltext&q=${encodeURIComponent(vendorName)}&page%5Bsize%5D=5`
    const searchRes = await gleifFetch(searchPath)
    const searchData = searchRes as {
      data?: Array<{
        attributes?: { value?: string }
        relationships?: {
          'lei-records'?: {
            data?: { id?: string }
          }
        }
      }>
    }

    // Some results lack the lei-records relationship (e.g. shell/placeholder entries).
    // Iterate to find the first result that actually carries a LEI.
    const results = searchData.data ?? []
    if (results.length === 0) {
      console.log('[pipeline:gleif] no autocomplete results for:', vendorName)
      return {}
    }

    const match = results.find((r) => r.relationships?.['lei-records']?.data?.id)
    if (!match) {
      console.log(
        '[pipeline:gleif] none of the', results.length, 'results have a LEI relationship for:', vendorName,
        '— values:', results.map((r) => r.attributes?.value).join(' | ')
      )
      return {}
    }

    const lei = match.relationships!['lei-records']!.data!.id!

    console.log('[pipeline:gleif] found LEI', lei, 'for:', vendorName)

    // Step 2 — fetch full entity record
    const leiRes = await gleifFetch(`/lei-records/${lei}`)
    const leiData = leiRes as {
      data?: {
        attributes?: Record<string, unknown>
        relationships?: Record<string, unknown>
      }
    }

    const attrs  = leiData.data?.attributes
    const entity = attrs?.entity as Record<string, unknown> | undefined
    const legalName    = (entity?.legalName as Record<string, unknown> | undefined)?.name as string | undefined
    const jurisdiction = entity?.jurisdiction as string | undefined
    const category     = entity?.category as string | undefined
    const status       = entity?.status as string | undefined
    const registeredAs = entity?.registeredAs as string | undefined

    // Step 3 — ultimate parent (best-effort; some records have only a reporting-exception link)
    let ultimateParent: GleifData['ultimateParent'] | undefined
    const rels       = leiData.data?.relationships
    const parentRel  = rels?.['ultimate-parent'] as Record<string, unknown> | undefined
    const parentData = parentRel?.data as Record<string, unknown> | null | undefined
    const parentLei  = parentData?.id as string | undefined

    if (parentLei && parentLei !== lei) {
      try {
        const parentRes  = await gleifFetch(`/lei-records/${parentLei}`)
        const parentRecord = parentRes as { data?: { attributes?: Record<string, unknown> } }
        const parentEntity = parentRecord.data?.attributes?.entity as Record<string, unknown> | undefined
        const parentName   = (parentEntity?.legalName as Record<string, unknown> | undefined)?.name as string | undefined
        ultimateParent = { lei: parentLei, name: parentName }
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
