import { NextResponse } from 'next/server'
import { head } from '@vercel/blob'
import { getDbContext } from '@/src/lib/session'

export async function GET() {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const logoUrl = ctx.org.logoUrl
  if (!logoUrl) return NextResponse.json({ url: null })

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    console.error('[logo-url] BLOB_READ_WRITE_TOKEN is not set')
    return NextResponse.json({ url: null })
  }

  try {
    const meta = await head(logoUrl, { token: blobToken })
    return NextResponse.json({ url: meta.downloadUrl })
  } catch (err) {
    console.error('[logo-url] head() failed:', err)
    return NextResponse.json({ url: null })
  }
}
