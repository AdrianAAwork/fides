import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { db } from '@/src/db'
import { organisations } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'

// TODO: SECURITY (MEDIUM) — file.type is the Content-Type header from the multipart form part,
// which is entirely attacker-controlled. An adversary can upload an SVG containing malicious
// JavaScript with Content-Type: image/png, bypassing the ALLOWED_TYPES check. The blob is then
// stored and served with whatever content-type was declared. Mitigation: read the first ~12 bytes
// of the buffer and check magic bytes (e.g. 0x89 0x50 0x4E 0x47 for PNG; FFD8FF for JPEG) before
// accepting the upload. Also consider stripping SVG from ALLOWED_TYPES since SVG supports inline
// script and can be used for XSS when served as image/svg+xml.
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('logo')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'File must be PNG, JPEG, or SVG' },
      { status: 400 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File must be under 2MB' },
      { status: 400 },
    )
  }

  const ext = file.type === 'image/svg+xml' ? 'svg'
    : file.type === 'image/png' ? 'png'
    : 'jpg'

  const filename = `logos/${ctx.org.id}-${Date.now()}.${ext}`

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    console.error('[logo upload] BLOB_READ_WRITE_TOKEN is not set')
    return NextResponse.json({ error: 'Blob storage is not configured on this server.' }, { status: 500 })
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch (err) {
    console.error('[logo upload] failed to read file buffer:', err)
    return NextResponse.json({ error: 'Failed to read uploaded file.' }, { status: 500 })
  }

  let blobUrl: string
  try {
    console.log('[logo upload] calling put:', filename, file.type, buffer.length, 'bytes')
    const blob = await put(filename, buffer, {
      access: 'private',
      contentType: file.type,
      token: blobToken,
    })
    blobUrl = blob.url
    console.log('[logo upload] put succeeded, url:', blobUrl)
  } catch (err) {
    console.error('[logo upload] Vercel Blob put failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Blob upload failed: ${msg}` }, { status: 500 })
  }

  const [updated] = await db
    .update(organisations)
    .set({ logoUrl: blobUrl })
    .where(and(eq(organisations.id, ctx.org.id), isNull(organisations.deletedAt)))
    .returning()

  console.log('[logo upload] DB updated, logoUrl:', updated?.logoUrl)
  return NextResponse.json({ logoUrl: updated.logoUrl })
}
