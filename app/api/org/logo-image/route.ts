import { getDbContext } from '@/src/lib/session'

export async function GET() {
  const ctx = await getDbContext()
  if (!ctx) return new Response('Unauthenticated', { status: 401 })

  const logoUrl = ctx.org.logoUrl
  if (!logoUrl) return new Response('Not found', { status: 404 })

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    console.error('[logo-image] BLOB_READ_WRITE_TOKEN is not set')
    return new Response('Server misconfiguration', { status: 500 })
  }

  try {
    const res = await fetch(logoUrl, {
      headers: { Authorization: `Bearer ${blobToken}` },
    })

    if (!res.ok) {
      console.error('[logo-image] blob fetch failed:', res.status, await res.text())
      return new Response('Failed to fetch logo', { status: 502 })
    }

    const contentType = res.headers.get('content-type') ?? 'image/png'
    const body = await res.arrayBuffer()

    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    console.error('[logo-image] fetch error:', err)
    return new Response('Error fetching logo', { status: 500 })
  }
}
