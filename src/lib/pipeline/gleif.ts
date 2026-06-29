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

export async function fetchGleif(vendorName: string, companiesHouseNumber?: string): Promise<GleifData> {
  try {
    let lei: string | undefined
    let matchMethod: GleifData['matchMethod']

    // Step 1a — if we have a CH number, try a direct registry-number lookup.
    // No jurisdiction filter: FC-prefixed foreign companies (Ireland, etc.) are not GB-jurisdiction
    // entities in GLEIF even though they have a UK Companies House number. A jurisdiction=GB filter
    // would silently fail for those, causing a fallback to fuzzy name-matching that can return an
    // entirely different legal entity.
    if (companiesHouseNumber) {
      const regPath = `/lei-records?filter%5Bentity.registeredAs%5D=${encodeURIComponent(companiesHouseNumber)}&page%5Bsize%5D=1`
      const regRes = await gleifFetch(regPath)
      const regData = regRes as { data?: Array<{ id?: string }> }
      lei = regData.data?.[0]?.id
      if (lei) {
        matchMethod = 'registeredAs'
        console.log('[pipeline:gleif] matched by registeredAs', companiesHouseNumber, '→ LEI', lei)
      } else {
        // Precise identifier lookup returned nothing. Do NOT fall back to name search:
        // a fuzzy match could silently return a different legal entity (e.g. a branch or
        // subsidiary with a similar name). Return no GLEIF data and let the analyst know.
        console.log('[pipeline:gleif] no GLEIF record for registeredAs', companiesHouseNumber, '— not falling back to name search to avoid wrong-entity match')
        return {}
      }
    }

    // Step 1b — name search, only when no identifying number was provided.
    // When a CH number was given but lookup failed, we already returned above.
    if (!lei) {
      const searchPath = `/autocompletions?field=fulltext&q=${encodeURIComponent(vendorName)}&page%5Bsize%5D=5`
      const searchRes = await gleifFetch(searchPath)
      const searchData = searchRes as {
        data?: Array<{
          attributes?: { value?: string }
          relationships?: { 'lei-records'?: { data?: { id?: string } } }
        }>
      }

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

      lei = match.relationships!['lei-records']!.data!.id!
      matchMethod = 'nameSearch'
      console.log('[pipeline:gleif] matched by name search → LEI', lei, 'entry:', match.attributes?.value, '— analyst should confirm this is the correct entity')
    }

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

    return { lei, legalName, jurisdiction, category, status, registeredAs, ultimateParent, matchMethod }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:gleif] error:', msg)
    return { error: msg }
  }
}
