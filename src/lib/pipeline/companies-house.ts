import type { CompaniesHouseData } from './types'

const BASE_URL = 'https://api.company-information.service.gov.uk'
const TIMEOUT_MS = 10_000

function authHeader(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY ?? ''
  return 'Basic ' + Buffer.from(key + ':').toString('base64')
}

async function chFetch(path: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: authHeader() },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`CH ${path} → ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchCompaniesHouseProfile(
  companyNumber: string
): Promise<CompaniesHouseData> {
  try {
    const [profile, officersRes, pscRes, filingsRes] = await Promise.all([
      chFetch(`/company/${companyNumber}`),
      chFetch(`/company/${companyNumber}/officers`),
      chFetch(`/company/${companyNumber}/persons-with-significant-control`),
      chFetch(`/company/${companyNumber}/filing-history`),
    ])

    const p = profile as Record<string, unknown>
    const offItems = ((officersRes as Record<string, unknown>).items ?? []) as Record<string, unknown>[]
    const pscItems = ((pscRes as Record<string, unknown>).items ?? []) as Record<string, unknown>[]
    const filItems = (((filingsRes as Record<string, unknown>).items ?? []) as Record<string, unknown>[]).slice(0, 5)

    // Extract website from registered data
    const website = (p.website as string | undefined) ?? undefined

    return {
      company_name: (p.company_name as string) ?? '',
      company_number: (p.company_number as string) ?? companyNumber,
      company_status: (p.company_status as string) ?? 'unknown',
      date_of_creation: p.date_of_creation as string | undefined,
      registered_office_address: p.registered_office_address as Record<string, string> | undefined,
      sic_codes: p.sic_codes as string[] | undefined,
      type: p.type as string | undefined,
      accounts: p.accounts as { next_due?: string; overdue?: boolean } | undefined,
      confirmation_statement: p.confirmation_statement as { next_due?: string; overdue?: boolean } | undefined,
      website,
      officers: offItems.map((o) => ({
        name: (o.name as string) ?? '',
        role: (o.officer_role as string) ?? '',
        appointed_on: o.appointed_on as string | undefined,
        resigned_on: o.resigned_on as string | undefined,
      })),
      psc: pscItems.map((ps) => ({
        name: (ps.name as string) ?? '',
        nationality: ps.nationality as string | undefined,
        natures_of_control: ps.natures_of_control as string[] | undefined,
        ceased: ps.ceased as boolean | undefined,
      })),
      filings: filItems.map((f) => ({
        date: (f.date as string) ?? '',
        description: (f.description as string) ?? '',
        category: f.category as string | undefined,
      })),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[pipeline:ch] error for ${companyNumber}:`, msg)
    return {
      company_name: '',
      company_number: companyNumber,
      company_status: 'unknown',
      officers: [],
      psc: [],
      filings: [],
      error: msg,
    }
  }
}

export async function searchCompaniesHouse(query: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = `${BASE_URL}/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`
    const res = await fetch(url, {
      headers: { Authorization: authHeader() },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`CH search → ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}
