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

// Map Companies House jurisdiction strings → GLEIF ISO 3166-1 alpha-2 codes.
// CH uses hyphenated lowercase names for UK sub-jurisdictions and full lowercase names
// for foreign jurisdictions (e.g. "ireland", "france", "us-ca").
function chJurisdictionToIso(chJurisdiction: string): string | undefined {
  const j = chJurisdiction.toLowerCase().trim()
  if (j === 'england-wales' || j === 'england' || j === 'wales' || j === 'scotland' || j === 'northern-ireland' || j === 'united-kingdom') return 'GB'
  if (j === 'ireland') return 'IE'
  if (j === 'france') return 'FR'
  if (j === 'germany') return 'DE'
  if (j === 'netherlands') return 'NL'
  if (j === 'spain') return 'ES'
  if (j === 'italy') return 'IT'
  if (j === 'belgium') return 'BE'
  if (j === 'luxembourg') return 'LU'
  if (j === 'sweden') return 'SE'
  if (j === 'denmark') return 'DK'
  if (j === 'norway') return 'NO'
  if (j === 'finland') return 'FI'
  if (j === 'switzerland') return 'CH'
  if (j === 'austria') return 'AT'
  if (j === 'portugal') return 'PT'
  if (j === 'poland') return 'PL'
  if (j === 'czech-republic' || j === 'czechia') return 'CZ'
  if (j === 'hungary') return 'HU'
  if (j === 'romania') return 'RO'
  if (j === 'bulgaria') return 'BG'
  if (j === 'australia') return 'AU'
  if (j === 'canada') return 'CA'
  if (j === 'japan') return 'JP'
  if (j === 'singapore') return 'SG'
  if (j === 'new-zealand' || j === 'new zealand') return 'NZ'
  if (j.startsWith('us-') || j === 'united-states' || j === 'united states') return 'US'
  // 2-letter ISO already (CH sometimes returns these directly)
  if (/^[a-z]{2}$/.test(j)) return j.toUpperCase()
  return undefined
}

export async function fetchGleif(
  vendorName: string,
  companiesHouseNumber?: string,
  chJurisdiction?: string,  // CH jurisdiction field — home country for overseas/FC companies
): Promise<GleifData> {
  try {
    let lei: string | undefined
    let matchMethod: GleifData['matchMethod']

    // Tier 1 — exact registration number lookup.
    // FC-prefixed foreign companies are indexed in GLEIF under their HOME jurisdiction
    // registration number, not the UK CH number. So this may miss for overseas entities.
    if (companiesHouseNumber) {
      const regPath = `/lei-records?filter%5Bentity.registeredAs%5D=${encodeURIComponent(companiesHouseNumber)}&page%5Bsize%5D=1`
      const regRes = await gleifFetch(regPath)
      const regData = regRes as { data?: Array<{ id?: string }> }
      lei = regData.data?.[0]?.id
      if (lei) {
        matchMethod = 'registeredAs'
        console.log('[pipeline:gleif] Tier 1 matched by registeredAs', companiesHouseNumber, '→ LEI', lei)
      } else {
        console.log('[pipeline:gleif] Tier 1 miss for registeredAs', companiesHouseNumber)
      }
    }

    // Tier 2 — legalName + jurisdiction filter.
    // Runs when a CH number was given but Tier 1 missed (typical for FC/overseas entities where
    // GLEIF holds the home-country registration number, not the UK CH number). Scoping by
    // jurisdiction is what prevents the wrong-country match (e.g. Bulgaria branch vs Ireland entity).
    if (!lei && companiesHouseNumber) {
      const isoCode = chJurisdiction ? chJurisdictionToIso(chJurisdiction) : undefined
      if (isoCode) {
        console.log('[pipeline:gleif] Tier 2 trying legalName+jurisdiction:', vendorName, '/', isoCode)
        const t2Path = `/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(vendorName)}&filter%5Bentity.jurisdiction%5D=${encodeURIComponent(isoCode)}&page%5Bsize%5D=5`
        const t2Res = await gleifFetch(t2Path)
        const t2Data = t2Res as { data?: Array<{ id?: string }> }
        const t2Results = t2Data.data ?? []

        if (t2Results.length === 1 && t2Results[0].id) {
          lei = t2Results[0].id
          matchMethod = 'nameSearch'
          console.log('[pipeline:gleif] Tier 2 matched by legalName+jurisdiction (', isoCode, ') → LEI', lei, '— analyst should confirm')
        } else if (t2Results.length > 1) {
          console.log('[pipeline:gleif] Tier 2 returned', t2Results.length, 'ambiguous matches for', vendorName, '/', isoCode, '— not using any')
        } else {
          console.log('[pipeline:gleif] Tier 2 no match for', vendorName, '/', isoCode)
        }
      } else {
        console.log('[pipeline:gleif] Tier 2 skipped — could not derive ISO code from CH jurisdiction:', chJurisdiction ?? '(none)')
      }

      if (!lei) {
        console.log('[pipeline:gleif] all tiers missed for', vendorName, '(CH:', companiesHouseNumber, ') — returning no GLEIF data')
        return {}
      }
    }

    // Tier name-only — runs when no CH number was provided at all (no identifying anchor).
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
          '[pipeline:gleif] none of the', results.length, 'results have a LEI for:', vendorName,
          '— values:', results.map((r) => r.attributes?.value).join(' | ')
        )
        return {}
      }

      lei = match.relationships!['lei-records']!.data!.id!
      matchMethod = 'nameSearch'
      console.log('[pipeline:gleif] name-only search → LEI', lei, 'entry:', match.attributes?.value, '— analyst should confirm')
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
