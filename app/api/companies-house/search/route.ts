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
    const data = await searchCompaniesHouse(q)
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
