import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { searchCompaniesHouse } from '@/src/lib/pipeline/companies-house'

export async function GET(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 })

  try {
    const data = await searchCompaniesHouse(q) as {
      items?: Array<Record<string, unknown>>
      total_results?: number
    }
    // CH search returns `title` for the company name; normalise to `company_name`
    // so the client can use the same field as the profile endpoint.
    const items = (data.items ?? []).map((item) => ({
      ...item,
      company_name: item.company_name ?? item.title ?? '',
    }))
    return NextResponse.json({ ...data, items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
