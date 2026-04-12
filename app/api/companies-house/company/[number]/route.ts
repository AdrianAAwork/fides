import { NextResponse } from 'next/server'
import { getDbContext } from '@/src/lib/session'
import { fetchCompaniesHouseProfile } from '@/src/lib/pipeline/companies-house'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { number } = await params
  if (!number) return NextResponse.json({ error: 'company number required' }, { status: 400 })

  const data = await fetchCompaniesHouseProfile(number)
  return NextResponse.json(data)
}
